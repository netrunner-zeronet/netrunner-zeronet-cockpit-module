
class UDisks
{

    static dbusClient() {
        if (!UDisks._dbusClient) {
            UDisks._dbusClient = cockpit.dbus(UDisks.UDISKS2_SERVICE, {superuser: "try"});
        }
        return UDisks._dbusClient;
    }

    static dbusObjectManager() {
        if (!UDisks._dbusObjectManager) {
            UDisks._dbusObjectManager = UDisks.dbusClient().proxy(UDisks.DBUS_OBJECT_MANAGER_INTERFACE, UDisks.UDISKS2_PATH);
        }
        return UDisks._dbusObjectManager;
    }

    constructor() {
        // Can't do static class members in Firefox...

        UDisks.DBUS_OBJECT_MANAGER_INTERFACE = "org.freedesktop.DBus.ObjectManager";

        UDisks.UDISKS2_SERVICE = "org.freedesktop.UDisks2";
        UDisks.UDISKS2_PATH = "/org/freedesktop/UDisks2";

        UDisks.UDISKS2_DRIVE_INTERFACE = "org.freedesktop.UDisks2.Drive";
        UDisks.UDISKS2_BLOCK_INTERFACE = "org.freedesktop.UDisks2.Block";
        UDisks.UDISKS2_FILESYSTEM_INTERFACE = "org.freedesktop.UDisks2.Filesystem";

        UDisks.dbusObjectManager().addEventListener("signal", (data) => {

            var path = data.detail[2][0];
            var interfaces = data.detail[2][1] || [];

            switch (data.detail[1]) {
            case "InterfacesAdded":

                var driveData = interfaces[UDisks.UDISKS2_DRIVE_INTERFACE];
                if (driveData !== undefined) {
                    if (this._knownDriveDbusPaths && this._knownDriveDbusPaths.includes(path)) {
                        console.log("Already know this drive", path);
                        return;
                    }

                    if (!this._knownDriveDbusPaths) {
                        this._knownDriveDbusPaths = [];
                    }

                    this._knownDriveDbusPaths.push(path);

                    if (this._driveAddedCbs) {
                        var udisksDrive = new UDisksDrive(path, driveData);

                        this._driveAddedCbs.forEach((cb) => {
                            cb(udisksDrive);
                        });
                    }
                }
                // TODO partitions somehow

                break;

            case "InterfacesRemoved":

                if (this._knownDriveDbusPaths && this._knownDriveDbusPaths.includes(path)) {

                    if (interfaces.includes(UDisks.UDISKS2_DRIVE_INTERFACE)) {

                        // Remove from known paths...
                        this._knownDriveDbusPaths = this._knownDriveDbusPaths.filter((item) => { item != path; });

                        if (this._driveRemovedCbs) {
                            this._driveRemovedCbs.forEach((cb) => {
                                cb(path);
                            });
                        }
                    }

                }

                break;

            }
        });
    }

    get drives() {
        return new Promise((resolve, reject) => {
            UDisks.dbusObjectManager().call("GetManagedObjects").done((result) => {
                var paths = result[0];

                var drives = [];

                if (!this._knownDriveDbusPaths) {
                    this._knownDriveDbusPaths = [];
                }


                for (let path in paths) {
                    var info = paths[path];

                    var drive = info[UDisks.UDISKS2_DRIVE_INTERFACE];
                    if (!drive) {
                        continue;
                    }

                    this._knownDriveDbusPaths.push(path);

                    var udisksDrive = new UDisksDrive(path, drive);

                    udisksDrive._processPartitions(paths);

                    drives.push(udisksDrive);
                }

                resolve(drives);
            }).fail(reject);
        });
    }

    // Would be lovely if we could also detect adding/removing of partitions
    // but let's keep it "simple"

    onDriveAdded(cb) {
        if (!this._driveAddedCbs) {
            this._driveAddedCbs = [];
        }
        this._driveAddedCbs.push(cb);
    }

    onDriveRemoved(cb) {
        if (!this._driveRemovedCbs) {
            this._driveRemovedCbs = [];
        }
        this._driveRemovedCbs.push(cb);
    }
}

class UDisksDrive
{

    constructor(nativePath, driveData) {
        this._nativePath = nativePath;
        this._vendor = driveData.Vendor.v;
        this._model = driveData.Model.v;
        this._removable = driveData.Removable.v;
    }

    get nativePath() { return this._nativePath; }
    get vendor() { return this._vendor; }
    get model() { return this._model; }

    get removable() { return this._removable; }

    get partitions() {
        return new Promise((resolve, reject) => {
            if (this._partitions) {
                return resolve(this._partitions);
            }

            // FIXME doesn't work when doing it right after getting the newly added drive
            // as the interfaces for the partitions have not yet been set up...
            UDisks.dbusObjectManager().call("GetManagedObjects").done((result) => {
                this._processPartitions(result[0]);
                resolve(this._partitions);
            }).fail(reject);
        });
    }

    // Called by UDisks when enumerating all devices
    // where we already did a callt o GetManagedObjects
    // so that we avoid doing the same thing again here
    _processPartitions(managedObjects) {
        // Now collect all the partitions
        for (let path in managedObjects) {
            var info = managedObjects[path];

            var fs = info[UDisks.UDISKS2_FILESYSTEM_INTERFACE];
            var block = info[UDisks.UDISKS2_BLOCK_INTERFACE];
            if (!fs || !block) {
                continue;
            }

            if (block.Drive.v != this._nativePath) {
                continue;
            }

            var partition = new UDisksPartition(path);
            partition._device = atob(block.Device.v);
            partition._label = block.HintName.v || block.IdLabel.v,
            partition._filesystem = block.IdType.v,
            partition._size = block.Size.v,
            partition._mountpoint = fs.MountPoints.v.map((base64) => {
                    return atob(base64);
            })[0] || "";

            if (!this._partitions) {
                this._partitions = [];
            }
            this._partitions.push(partition);
        }
    }
}

class UDisksPartition
{

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
        if (!this._mountpointChangedCbs) {
            this._mountpointChangedCbs = [];
        }
        this._mountpointChangedCbs.push(cb);
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

    }

    _updateProps(data) {
        var props = {
            "Device": {
                field: "_device",
                modifier: atob
            },
            "Label": {
                field: "_label",
                fallback: "IdLabel"
            },
            "IdType": {
                field: "_filesystem"
            },
            "MountPoints": {
                field: "_mountpint",
                notifier: this._mountpointChangedCbs,
                modifier: atob
            }
        }
    }
}

