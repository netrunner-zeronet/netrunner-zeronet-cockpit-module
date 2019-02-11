
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

}
