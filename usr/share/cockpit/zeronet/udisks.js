
class UDisks
{
    // can't to static const nor private..
    static DBUS_OBJECT_MANAGER_INTERFACE = "org.freedesktop.DBus.ObjectManager";

    static UDISKS2_SERVICE = "org.freedesktop.UDisks2";
    static UDISKS2_PATH = "/org/freedesktop/UDisks2";

    static UDISKS2_DRIVE_INTERFACE = "org.freedesktop.UDisks2.Drive";
    static UDISKS2_BLOCK_INTERFACE = "org.freedesktop.UDisks2.Block";
    static UDISKS2_FILESYSTEM_INTERFACE = "org.freedesktop.UDisks2.Filesystem";

    _removableDriveAddedCbs = [];
    _removableDriveRemovedCbs = [];

    static _dbusClient = null;
    static dbusClient() {
        if (!UDisks._dbusClient) {
            UDisks._dbusClient = cockpit.dbus(UDisks.UDISKS2_SERVICE, {superuser: "try"});
        }
        return UDisks._dbusClient;
    }

    constructor() {

    }

    get removableDrives() {
        var udisks2_object_manager = UDisks.dbusClient().proxy(UDisks.DBUS_OBJECT_MANAGER_INTERFACE, UDisks.UDISKS2_PATH);

        return new Promise((resolve, reject) => {
            udisks2_object_manager.call("GetManagedObjects").done((result) => {
                var paths = result[0];

                var drives = [];

                for (let path in paths) {
                    var info = paths[path];

                    var drive = info[UDisks.UDISKS2_DRIVE_INTERFACE];
                    if (!drive) {
                        continue;
                    }

                    if (!drive.MediaRemovable.v) {
                        continue;
                    }

                    var udisksDrive = new UDisksDrive(path, drive);

                    // Now collect all the partitions
                    for (let partitionPath in paths) {
                        var info = paths[partitionPath];

                        var fs = info[UDisks.UDISKS2_FILESYSTEM_INTERFACE];
                        var block = info[UDisks.UDISKS2_BLOCK_INTERFACE];
                        if (!fs || !block) {
                            continue;
                        }

                        if (block.Drive.v != path) {
                            continue;
                        }

                        var partition = new UDisksPartition(partitionPath);
                        partition._device = atob(block.Device.v);
                        partition._label = block.HintName.v || block.IdLabel.v,
                        partition._filesystem = block.IdType.v,
                        partition._size = block.Size.v,
                        partition._mountpoint = fs.MountPoints.v.map((base64) => {
                                return atob(base64);
                        })[0] || "";

                        udisksDrive._partitions.push(partition);
                    }

                    drives.push(udisksDrive);
                }

                // Now collect all partitions that belong to the the media we're interested in
                var interestingPartitions = [];


                resolve(drives);
            }).fail(reject);
        });
    }

    onRemovableDriveAdded(cb) {
        this._removableDriveAddedCbs.push(cb);
    }

    onRemovableDriveRemoved(cb) {
        this._removableDriveRemovedCbs.push(cb);
    }
}

class UDisksDrive
{

    _partitions = [];

    constructor(nativePath, driveData) {
        this._nativePath = nativePath;
        this._vendor = driveData.Vendor.v;
        this._model = driveData.Model.v;
    }

    get nativePath() { return this._nativePath; }
    get vendor() { return this._vendor; }
    get model() { return this._model; }

    get partitions() { return this._partitions; }
}

class UDisksPartition
{

    _filesystemProxy = null;

    _mountpointChangedCbs = [];

    constructor(nativePath) {
        this._nativePath = nativePath;

        this._filesystemProxy = UDisks.dbusClient().proxy(UDisks.UDISKS2_FILESYSTEM_INTERFACE, nativePath);
        this._filesystemProxy.addEventListener("changed", (data) => {
            console.log("Change in", nativePath, "is", data);
        });
    }

    get nativePath() { return this._nativePath; }
    get device() { return this._device; }
    get label() { return this._label; }
    get filesystem() { return this._filesystem; }
    get size() { return this._size; }

    get mountpoint() { return this._mountpoint; }

    get mounted() { return !!this.mountpoint; }

    // TODO would be lovely to have a base class with this property and notification/event handling stuff
    onMountpointChanged(cb) {
        _mountpointChangedCbs.push(cb);
    }

    get freeSpace() {
        return new Promise((resolve, reject) => {

            if (this._freeSpace !== undefined) {
                return resolve(this._freeSpace);
            }

            if (!this.mountpoint) {
                return reject("No mountpoint");
            }

            // FIXME size of udisks and df free is in different units
            var proc = cockpit.spawn(["df", "-P", "-B 1", this.mountpoint], {superuser: true});
            proc.done((data) => {
                var line = data.split("\n")[1];
                if (!line) {
                    return reject("No valid output");
                }

                // ouch...
                var rx = /\w+\s*\d+\s+\d+\s+(\d+)/;

                var freeSpace = line.match(rx)[1];
                if (typeof freeSpace === undefined) {
                    return reject("Failed to parse free space");
                }

                this._freeSpace = freeSpace;
                resolve(freeSpace);
            });
            proc.fail(reject);
        });
    }

    mount() {
        return new Promise((resolve, reject) => {
            this._filesystemProxy.call("Mount", [{}]).done((result) => {
                this._mountpoint = result[0];
                resolve(this._mountpoint);
            }).fail(reject);
        });
    }

    unmount() {
        return new Promise((resolve, reject) => {
            this._filesystemProxy.call("Unmount", [{}]).done(resolve).fail(reject);
        });
    }

    invalidate() {
        this._freeSpace = undefined;
    }
}

