
class StorageUtils
{

    static _exists(path, arg)  {
        return new Promise((resolve, reject) => {
            if (arg.length !== 1) {
                throw new TypeError("Invalid test argument");
            }

            // FIXME Can't escape with quotes for some reason, so escaping spaces manually?!
            // Figure out how to fix that or also escape backslash etc
            path = path.replace(/ /g, "\\ ");
            var args = ["sh", "-c", `test -${arg} ${path}`];

            cockpit.spawn(args,/* "'" + path + "'"],*/ {superuser: true}).done((result) => {
                resolve(true);
            }).fail((err) => {
                if (err.exit_status === 1) { // does not exist
                    return resolve(false);
                }
                reject(err);
            });
        });
    }

    static fileExists(path) {
        return StorageUtils._exists(path, "f");
    }

    static dirExists(path) {
        return StorageUtils._exists(path, "d");
    }

    static diskUsage(path) {
        return new Promise((resolve, reject) => {
            cockpit.spawn(["du", "-sb", path], {superuser: true}).done((result) => {
                var rx = /(\d+)\s+.*/;

                var usage = result.match(rx)[1];

                if (typeof usage !== "string") {
                    return reject("Failed to parse output");
                }

                usage = parseInt(usage);
                if (isNaN(usage)) {
                    return reject("Failed to convert usage to number");
                }

                resolve(usage);
            }).fail(reject);
        });
    }

    static diskFree(mountpoint) {
        return new Promise((resolve, reject) => {
            cockpit.spawn(["df", "-P", "-B 1", mountpoint], {superuser: true}).done((result) => {

                var line = result.split("\n")[1];
                if (!line) {
                    return reject("No valid output");
                }

                // ouch...
                var rx = /\w+\s*\d+\s+\d+\s+(\d+)/;

                var freeSpace = line.match(rx)[1];
                if (typeof freeSpace === undefined) {
                    return reject("Failed to parse free space");
                }

                freeSpace = parseInt(freeSpace);
                if (isNaN(freeSpace)) {
                    return reject("Failed to converr freeSpace to number");
                }

                resolve(freeSpace);

            }).fail(reject);
        });
    }

    static move(source, destination) {
        return new Promise((resolve, reject) => {
            var args = ["mv", source, destination];

            cockpit.spawn(args, {superuser: true}).done(resolve).fail(reject);
        });
    }

    static mtime(path) {
        return new Promise((resolve, reject) => {

            var args = ["stat", "-c", "%Y", path];

            cockpit.spawn(args, {superuser: true}).done((result) => {
                var resultNumber = Number(result);
                if (isNaN(resultNumber)) {
                    return reject("Failed to parse output");
                }

                var tzOffset = new Date().getTimezoneOffset() /*in minutes!*/ * 60;
                var d = new Date((resultNumber + tzOffset) * 1000);

                resolve(d);
            }).fail((err) => {
                reject(err);
            });
        });
    }

}

class LocaleUtils
{

    static formatSize(size) {
        if (!size) {
            size = 0;
        }

        // TODO what about i18n
        var suffixes = ["B", "kiB", "MiB", "GiB", "TiB"];
        var suffixIndex = 0;
        while (size > 1024) {
            size /= 1024;
            ++suffixIndex;
        }

        var displaySize = Number(Math.round(size * 10) / 10).toFixed(1).toLocaleString();

        return displaySize + " " + suffixes[suffixIndex];
    }

}

class DBusUtils
{

    constructor(args) {
        this._args = args || {};
    }

    get _client() {
        if (!this._dbusClient) {
            this._dbusClient = cockpit.dbus("org.freedesktop.DBus", this._args);
        }
        return this._dbusClient;
    }

    onServiceRegistered(cb) {
        this._setupSignalHandlers();
        if (!this._serviceRegisteredCbs) {
            this._serviceRegisteredCbs = [];
        }
        this._serviceRegisteredCbs.push(cb);
    }

    onServiceUnregistered(cb) {
        this._setupSignalHandlers();
        if (!this._serviceUnregisteredCbs) {
            this._serviceUnregisteredCbs = [];
        }
        this._serviceUnregisteredCbs.push(cb);
    }

    isServiceRegistered(name) {
        return new Promise((resolve, reject) => {
            this._client.call("/org/freedesktop/DBus", "org.freedesktop.DBus", "ListNames").done((data) => {
                resolve(data[0].includes(name));
            }, reject);
        });
    }

    _setupSignalHandlers() {
        this._proxy = this._client.proxy("org.freedesktop.DBus",
                                         "/org/freedesktop/DBus");
        this._proxy.addEventListener("signal", (e) => {
            if (e.detail[1] === "NameOwnerChanged") {
                var serviceName = e.detail[2][0];
                if (!serviceName) { // can this happen?
                    return;
                }
                var oldOwner = e.detail[2][1];
                var newOwner = e.detail[2][2];

                if (!oldOwner && !newOwner) { // can this happen?
                    return;
                }

                var cbsToCall = undefined;

                // should we check for typeof string?
                if (!oldOwner && newOwner) {
                    cbsToCall = this._serviceRegisteredCbs;
                } else {
                    cbsToCall = this._serviceUnregisteredCbs;
                }

                if (cbsToCall && cbsToCall.length > 0) {
                    cbsToCall.forEach((cb) => {
                        cb(serviceName); // pass along owner?
                    });
                }
            }
        });
    }

}

class UiUtils
{

    static createElementWithClassName(name, className) {
        var element = document.createElement(name);
        element.className = className;
        return element;
    }

    static createButton(type) {
        return UiUtils.createElementWithClassName("button", "btn btn-" + type);
    }

}
