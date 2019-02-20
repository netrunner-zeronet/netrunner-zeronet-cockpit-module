
const DBUS_PROPERTIES_INTERFACE = "org.freedesktop.DBus.Properties";

class Systemd
{

    static dbusClient() {
        if (!Systemd._dbusClient) {
            Systemd._dbusClient = cockpit.dbus(Systemd.SYSTEMD1_SERVICE, {superuser: "try"});
        }
        return Systemd._dbusClient;
    }

    constructor() {
        Systemd.SYSTEMD1_SERVICE = "org.freedesktop.systemd1";
        Systemd.SYSTEMD1_PATH = "/org/freedesktop/systemd1";

        Systemd.SYSTEMD1_MANAGER_INTERFACE = "org.freedesktop.systemd1.Manager";
        Systemd.SYSTEMD1_UNIT_INTERFACE = "org.freedesktop.systemd1.Unit";
        Systemd.SYSTEMD1_JOB_INTERFACE = "org.freedesktop.systemd1.Job";
    }

    static dbusManager() {
        if (!Systemd._systemdManager) {
            Systemd._systemdManager = Systemd.dbusClient().proxy(Systemd.SYSTEMD1_MANAGER_INTERFACE, Systemd.SYSTEMD1_PATH);
        }
        return Systemd._systemdManager;
    }

    // TODO would be nice to be able to just start/stop units without getting them first

    getUnit(name) {
        return new Promise((resolve, reject) => {

            new Promise((resolve, reject) => {

                Systemd.dbusManager().call("GetUnit", [name]).done((result) => {

                    resolve(new SystemdUnit(result[0]));

                }).fail((err) => {

                    if (err.name === "org.freedesktop.systemd1.NoSuchUnit") {
                        // Try LoadUnit and see if that helps
                        Systemd.dbusManager().call("LoadUnit", [name]).done((result) => {
                            // We always get a unit, even if it doesn't exist
                            // it will be "dead" (just as when not running) but canStart will also be false
                            // FIXME can we tell? cf. https://github.com/systemd/systemd/issues/1929
                            resolve(new SystemdUnit(result[0]));

                        }).fail(reject);

                        return;
                    }

                    reject(err);
                });

            }).then((unit) => {

                unit.invalidate().then(() => {
                    resolve(unit);
                }, reject);

            }, reject);

        });
    }
}

class SystemdUnit
{

    constructor(dbusPath) {
        if (!dbusPath) {
            throw new TypeError("Cannot create SystemdUnit without dbusPath");
        }

        SystemdUnit._interestedProps = {
            "Id": {

            },
            "Description": {

            },
            "SubState": {
                changeCbs: "_subStateChangedCbs"
            },
            "CanStart": {

            },
            "CanStop": {

            }
        };

        this._dbusPath = dbusPath;

        // FIXME use client "changed" signals instead
        // documentation says "data" contains only the changed properties
        // but I get back the entire proxy?!

        this._dbusPropertiesProxy = Systemd.dbusClient().proxy(DBUS_PROPERTIES_INTERFACE, this._dbusPath);

        this._dbusPropertiesProxy.addEventListener("signal", (data) => {
            if (data.detail[1] === "PropertiesChanged" && data.detail[2][0] === Systemd.SYSTEMD1_UNIT_INTERFACE) {
                var changedProps = data.detail[2][1];

                Object.keys(changedProps).forEach((prop) => {
                    this._updateProp(prop, changedProps[prop].v);
                });
            }
        });
    }

    get id() { return this._id; }

    get description() { return this._description; }

    get subState() { return this._subState; }

    get canStart() { return this._canStart; }
    get canStop() { return this._canStop; }

    start() {
        return new Promise((resolve, reject) => {
            Systemd._systemdManager.call("StartUnit", [this._id, "replace"]).done(resolve).fail(reject);
        });
    }

    stop() {
        return new Promise((resolve, reject) => {
            Systemd._systemdManager.call("StopUnit", [this._id, "replace"]).done(resolve).fail(reject);
        });
    }

    _updateProp(dbusName, newValue, changeCbs) {
        var propInfo = SystemdUnit._interestedProps[dbusName];
        if (!propInfo) {
            return false;
        }

        var localField = propInfo.localField;
        if (!localField) {
            // prepend underscore, lowercase first letter
            localField = "_" + dbusName.charAt(0).toLowerCase() + dbusName.slice(1);
        }

        var changeCbs = this[propInfo.changeCbs];

        var oldValue = this[localField];
        this[localField] = newValue;

        if (oldValue && changeCbs && changeCbs.length > 0) {
            changeCbs.forEach((cb) => {
                cb(newValue);
            });
        }
        return true;
    }

    onSubStateChanged(cb) {
        if (!this._subStateChangedCbs) {
            this._subStateChangedCbs = [];
        }
        this._subStateChangedCbs.push(cb);
    }

    // TODO just call this in the constructor?
    invalidate() {
        return new Promise((resolve, reject) => {

            var promises = [];

            Object.keys(SystemdUnit._interestedProps).forEach((dbusProp) => {

                var promise = new Promise((resolve, reject) => {
                    this._dbusPropertiesProxy.call("Get", [Systemd.SYSTEMD1_UNIT_INTERFACE, dbusProp]).done((result) => {
                        resolve({
                            name: dbusProp,
                            value: result[0].v
                        });
                    }).fail(reject);
                });
                promises.push(promise);
            });

            Promise.all(promises).then((results) => {

                results.forEach((result) => {
                    this._updateProp(result.name, result.value);
                });

                return resolve();

            }, reject);

        });
    }

}
