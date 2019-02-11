
const DBUS_PROPERTIES_INTERFACE = "org.freedesktop.DBus.Properties";

class Systemd
{

    static SYSTEMD1_SERVICE = "org.freedesktop.systemd1";
    static SYSTEMD1_PATH = "/org/freedesktop/systemd1";

    static SYSTEMD1_MANAGER_INTERFACE = "org.freedesktop.systemd1.Manager";
    static SYSTEMD1_UNIT_INTERFACE = "org.freedesktop.systemd1.Unit";
    static SYSTEMD1_JOB_INTERFACE = "org.freedesktop.systemd1.Job";

    static dbusClient = cockpit.dbus(Systemd.SYSTEMD1_SERVICE, {superuser: "try"});

    constructor() {

    }

    static dbusManager() {
        if (!Systemd._systemdManager) {
            Systemd._systemdManager = Systemd.dbusClient.proxy(Systemd.SYSTEMD1_MANAGER_INTERFACE, Systemd.SYSTEMD1_PATH);

            Systemd._systemdManager.addEventListener("signal", (data) => {
                //console.log("SDMANAGER SIGNAL", data);
            });
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

    static _interestedProps = {
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

        },
        "CanReload": {

        }
    };

    _dbusPropertiesProxy = null;

    _subStateChangedCbs = [];

    constructor(dbusPath) {
        if (!dbusPath) {
            throw new TypeError("Cannot create SystemdUnit without dbusPath");
        }

        this._dbusPath = dbusPath;

        // FIXME use client "changed" signals instead
        // documentation says "data" contains only the changed properties
        // but I get back the entire proxy?!

        this._dbusPropertiesProxy = Systemd.dbusClient.proxy(DBUS_PROPERTIES_INTERFACE, this._dbusPath);

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
    get canReload() { return this._canReload; }

    start() {
        return this._dbusManagerCallAndInvalidate("StartUnit", [this._id, "replace"]);
    }

    stop() {
        return this._dbusManagerCallAndInvalidate("StopUnit", [this._id, "replace"]);
    }

    reload() {

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

    _dbusManagerCallAndInvalidate(...args) {
        return new Promise((resolve, reject) => {
            Systemd._systemdManager.call.apply(this, args).done((result) => {

                var jobProxy = Systemd.dbusClient.proxy(Systemd.SYSTEMD1_JOB_INTERFACE, result[0]);
                jobProxy.wait(() => { console.log("PRXWT", jobProxy.valid); });
                console.log("PRX", jobProxy, jobProxy.valid);
                jobProxy.addEventListener("signal", (sig) =>  {
                    console.log("SGI", sig);
                });
                jobProxy.addEventListener("changed", (sig) =>  {
                    console.log("CHG", sig.detail);
                });

                jobProxy.onchanged = (sig) => { console.log("CHG NO LIST", sig); };

                var jobPropertiesProxy = Systemd.dbusClient.proxy(DBUS_PROPERTIES_INTERFACE, result[0]);
                console.log("BLA", jobPropertiesProxy);
                jobPropertiesProxy.addEventListener("signal", (sig) =>  {
                    console.log("PPSGI", sig);
                });
                jobPropertiesProxy.addEventListener("changed", (sig) =>  {
                    console.log("PPCHG", sig);
                });
                jobPropertiesProxy.wait(() => {
                    console.log("PPWAIT", jobPropertiesProxy.valid);
                });


            }).fail(reject);
        });
    }

    onSubStateChanged(cb) {
        this._subStateChangedCbs.push(cb);
    }

    invalidate() {
        return new Promise((resolve, reject) => {

            var oldSubState = this._subState;

            var promises = [];


                this._dbusPropertiesProxy.call("Get", ["org.freedesktop.systemd1.Service", "StatusText"]).done((result) => {


                }).fail((err) => { console.warn("FÄIL", err); });



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
