
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
            cockpit.spawn(["du", "-s", "-B 1", path], {superuser: true}).done((result) => {
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

    static find(path, args) {
        var args = ["find", path];

        if (args) {
            if (args.type) {
                if (args.type.length === 1) {
                    args.push("-type", args.type);
                } else {
                    throw new TypeError("Illegal find type specified");
                }
            }
        }

        cockpit.spawn(args, {superuser: true}).done((result) => {
            console.log("listing", result);
        }).fail(reject);
    }

    static move(source, destination) {
        var args = ["mv", source, destination];


    }

    static symlinkTarget(path) {
        return new Promise((resolve, reject) => {
            var args = ["readlink", "-f" /*canonicalize*/, path];

            cockpit.spawn(args, {superuser: true}).done((result) => {
                resolve(result.trim());
            }).fail((err) => {
                if (err.exit_status === 1) { // not a symlink
                    return resolve("");
                }
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

        var displaySize = Number(size.toFixed(1)).toLocaleString();

        return displaySize + " " + suffixes[suffixIndex];
    }

}
