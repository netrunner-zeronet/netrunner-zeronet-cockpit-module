
const ZERONET_UNITNAME = "zeronet.service";
const SUPPORTED_FILESYSTEMS = ["ext3", "ext4", "xfs", "btrfs", "ntfs", "vfat"];

const DEFAULT_ZERONET_FOLDER = "/opt/zeronet/ZeroNet-master"
const ZERONET_CURRENT_CONFIG_FILE = "/opt/zeronet/current.conf"
const ZERONET_SERVICE_FILE = "/usr/lib/systemd/system/zeronet.service"

class Zeronet
{

    static currentZeronetUuid() {
        return new Promise((resolve, reject) => {
            // TODO cache?
            cockpit.file(ZERONET_CURRENT_CONFIG_FILE).read().done((data) => {
                if (data) {
                    resolve(data.trim());
                } else {
                    resolve("");
                }
            }).fail((err) => {
                resolve("");
            });
        });
    }

    static setCurrentZeronetUuid(uuid) {
        return new Promise((resolve, reject) => {
            cockpit.file(ZERONET_CURRENT_CONFIG_FILE).replace(uuid).done(() => {
                if (Zeronet._currentZeronetUuidChangedCbs) {
                    Zeronet._currentZeronetUuidChangedCbs.forEach((cb) => {
                        cb(uuid);
                    });
                }
                resolve();
            }).fail(reject);
        });
    }

    static onCurrentZeronetUuidChanged(cb) {
        if (!Zeronet._currentZeronetUuidChangedCbs) {
            Zeronet._currentZeronetUuidChangedCbs = [];
        }
        Zeronet._currentZeronetUuidChangedCbs.push(cb);
    }

    static get currentPartitionItem() {
        return Zeronet._currentPartitionItem;
    }
    static set currentPartitionItem(newItem) {
        var oldItem = Zeronet._currentPartitionItem;
        Zeronet._currentPartitionItem = newItem;

        (Zeronet._currentPartitionItemChangedCbs || []).forEach((cb) => {
            cb(newItem, oldItem);
        });
    }

    static onCurrentPartitionItemChanged(cb) {
        if (!Zeronet._currentPartitionItemChangedCbs) {
            Zeronet._currentPartitionItemChangedCbs = [];
        }
        Zeronet._currentPartitionItemChangedCbs.push(cb);
    }

    constructor() {
        this._systemd = new Systemd();

        document.getElementById("openBtn").addEventListener("click", () => {
            window.open("http://" + window.location.hostname);
        });

        document.getElementById("openSystemdBtn").addEventListener("click", () => {
            cockpit.jump('/system/services#/zeronet.service');
        });
    }

    getUnit() {
        return new Promise((resolve, reject) => {
            if (this._zeronetUnit) {
                return resolve(this._zeronetUnit);
            }

            this._systemd.getUnit(ZERONET_UNITNAME).then((unit) => {
                this._zeronetUnit = unit;
                resolve(unit);
            }, reject);
        });
    }

    static showMessage(type, text) {
       var element = document.createElement("div");
       element.className = `alert alert-${type} alert-dismissable`;// fade show`;
       element.role = "alert";

       element.innerHTML = `${text}
  <button type="button" class="close" data-dismiss="alert" aria-label="Close">
    <span aria-hidden="true">&times;</span>
  </button>`;

        document.getElementById("messages").appendChild(element);
    }

}

class ZeronetPartitionTemplate
{

    constructor() {
        var html = `
<div class="list-view-pf-actions">
    <button class="btn btn-primary hiddnn target-selection-hidden" data-id="startButton">Start</button>
    <button class="btn btn-primary hidden target-selection-hidden" data-id="stopButton">Stop</button>
    <button class="btn btn-default hidden target-selection-hidden" data-id="copyToButton">Copy to…</button>
    <button class="btn btn-primary target-selection-shown" data-id="copyHereButton">Copy here</button>
</div>

<div class="list-view-pf-main-info">
    <div class="list-view-pf-left">
        <span class="fa fa-volume list-view-pf-icon-sm">
            <img src="style/usbdev.svg" data-id="icon" width="100%" height="100%">
        </span>
    </div>

    <div class="list-view-pf-body">
        <div class="list-view-pf-description">
            <div class="list-group-item-heading">
                <span data-id="heading"></span>
                <span data-id="heading-badge" class="label"></span>
                <span data-id="busy-indicator" class="spinner spinner-sm spinner-inline"></span>
            </div>
            <div class="list-group-item-text" data-id="text"></div>

            <div class="progress progress-xs" data-id="progress-bar-container">
                <div class="progress-bar" data-id="progress-bar"></div>
            </div>
        </div>

        <div class="list-view-pf-additional-info">
            <div class="list-view-pf-additional-info-item" data-id="free-space-info-container">
                <span class="pficon pficon-volume"></span>
                <span data-id="free-space-info"></span>
            </div>
            <div class="list-view-pf-additional-info-item">
                <span class="pficon pficon-cluster"></span>
                <span data-id="filesystem-info"></span>
            </div>
            <div class="list-view-pf-additional-info-item" data-id="zeronet-info-container">
                <span class="pficon pficon-network"></span>
                <span data-id="zeronet-info"></span>
            </div>
            <div class="list-view-pf-additional-info-item" data-id="last-used-info-container">
                <span class="fa fa-clock-o"></span>
                <span data-id="last-used-info"></span>
            </div>
        </div>
    </div>
</div>`;

        this._domElement = UiUtils.createElementWithClassName("div", "list-group-item");
        this._domElement.innerHTML = html;

        this._startButton = this._findDomItem("startButton");
        this._stopButton = this._findDomItem("stopButton");
        this._copyToButton = this._findDomItem("copyToButton");
        this._copyHereButton = this._findDomItem("copyHereButton");

        this._iconElement = this._findDomItem("icon");

        this._headingElement = this._findDomItem("heading");
        this._headingBadge = this._findDomItem("heading-badge");

        this._busyIndicator = this._findDomItem("busy-indicator");

        this._textElement = this._findDomItem("text");

        this._progressBarContainer = this._findDomItem("progress-bar-container");
        this._progressBar = this._findDomItem("progress-bar");

        this._freeSpaceInfoContainer = this._findDomItem("free-space-info-container");
        this._freeSpaceInfo = this._findDomItem("free-space-info");
        this._filesystemInfo = this._findDomItem("filesystem-info");
        this._zeronetInfoContainer = this._findDomItem("zeronet-info-container");
        this._zeronetInfo = this._findDomItem("zeronet-info");
        this._lastUsedInfoContainer = this._findDomItem("last-used-info-container");
        this._lastUsedInfo = this._findDomItem("last-used-info");

        this._updateSpaceInfo();
        this._updateLastUsedInfo();
        this.zeronet = "";
        this.busy = false;
    }

    get domElement() {
        return this._domElement;
    }

    _findDomItem(id) {
        return this._domElement.querySelector("[data-id='" + id + "']");
    }

    _updateSpaceInfo() {
        if (this._totalSize && this._freeSpace) {
            this._progressBarContainer.classList.remove("hidden");
            this._freeSpaceInfoContainer.classList.remove("hidden");
        } else {
            this._progressBarContainer.classList.add("hidden");
            this._freeSpaceInfoContainer.classList.add("hidden");
        }

        this._progressBar.style.width = (100 - (this._freeSpace / this._totalSize) * 100) + "%";

        let totalLabel = LocaleUtils.formatSize(this._totalSize);

        if (this._freeSpace) {
            let freeLabel = LocaleUtils.formatSize(this._freeSpace);
            this._freeSpaceInfo.innerHTML = `<strong>${freeLabel} free</strong> of ${totalLabel}`;
        } else if (this._totalSize >= 0) {
            this._freeSpaceInfo.innerHTML = totalLabel;
        } else {
            this._freeSpaceInfo.innerText = "Unknown";
        }
    }

    _updateLastUsedInfo() {
        var text = "";
        // FIXME this._status is only ZeronetPartition
        // so we kinda break the separation between "dumb UI" (template) and "logic UI" (uiPartiton) here
        if (this._lastUsedDate && [undefined, "", "failed", "dead"].includes(this._status)) {
            // TODO proper locale, but the page is English right now so be consistent with that
            // GB ensures a sane order of date-month-year over US
            text = `Last used <strong>${this._lastUsedDate.toLocaleString("en-GB")}</strong>`;
        }
        this._lastUsedInfo.innerHTML = text;
        this._lastUsedInfoContainer.classList[text ? "remove" : "add"]("hidden");
    }

    get icon() {
        return this._iconElement.dataset.icon;
    }
    set icon(icon) {
        this._iconElement.dataset.icon = icon;
        this._iconElement.src = "style/" + icon + ".svg";
    }

    get mounted() {
        return this._iconElement.classList.contains("list-view-pf-icon-success");
    }
    set mounted(mounted) {
        this._iconElement.classList[mounted ? "add" : "remove"]("pficon");
        this._iconElement.classList[mounted ? "add" : "remove"]("list-view-pf-icon-success");
    }

    get heading() {
        return this._headingElement.innerText;
    }
    set heading(text) {
        this._headingElement.innerText = text;
    }

    get headingBadge() {
        return this._headingBadge.innerText;
    }
    set headingBadge(text) {
        if (!this.headingBadgeType) {
            this.headingBadgeType = "default";
        }
        this._headingBadge.innerText = text;
    }

    get headingBadgeType() {
        return this._headingBadge.dataset.labelType;
    }
    set headingBadgeType(type) {
        this._headingBadge.className = "label label-" + type;
        this._headingBadge.dataset.labelType = type;
    }

    get busy() {
        !this._busyIndicator.classList.contains("hidden");
    }
    set busy(busy) {
        this._busyIndicator.classList[busy ? "remove" : "add"]("hidden");
    }

    get text() {
        return this._textElement.innerHTML;
    }
    set text(text) {
        this._textElement.innerHTML = text;
    }

    get totalSize() {
        return this._totalSize;
    }
    set totalSize(size) {
        if (size < 0) {
            throw new TypeError("Total size cannot be negative");
        }
        this._totalSize = size;
        this._updateSpaceInfo();
    }

    get freeSpace() {
        return this._freeSpace;
    }
    set freeSpace(space) {
        if (space < 0) {
            throw new TypeError("Free space cannot be negative");
        }
        this._freeSpace = space;
        this._updateSpaceInfo();
    }

    get filesystem() {
        return this._filesystemInfo.innerText;
    }
    set filesystem(fs) {
        this._filesystemInfo.innerText = fs;
    }

    get zeronet() {
        return this._zeronetInfo.innerHTML;
    }
    set zeronet(zn) {
        this._zeronetInfoContainer.classList[zn ? "remove" : "add"]("hidden");
        this._zeronetInfo.innerHTML = zn;
    }

    get lastUsed() {
        return this._lastUsedDate;
    }
    set lastUsed(date) {
        this._lastUsedDate = date;
        this._updateLastUsedInfo();
    }

    get startButtonVisible() {
        !this._startButton.classList.contains("hidden");
    }
    set startButtonVisible(visible) {
        this._startButton.classList[visible ? "remove" : "add"]("hidden");
    }
    get startButtonEnabled() {
        !this._startButton.disabled;
    }
    set startButtonEnabled(enable) {
        this._startButton.disabled = enable ? "" : "disabled";
    }
    onStartButtonClicked(cb) {
        if (!this._startButtonClickedCbs) {
            this._startButtonClickedCbs = [];

            this._startButton.addEventListener("click", () => {
                this._startButtonClickedCbs.forEach(cb);
            });
        }
        this._startButtonClickedCbs.push(cb);
    }

    get stopButtonVisible() {
        !this._stopButton.classList.contains("hidden");
    }
    set stopButtonVisible(visible) {
        this._stopButton.classList[visible ? "remove" : "add"]("hidden");
    }
    get stopButtonEnabled() {
        !this._stopButton.disabled;
    }
    set stopButtonEnabled(enable) {
        this._stopButton.disabled = enable ? "" : "disabled";
    }
    onStopButtonClicked(cb) {
        if (!this._stopButtonClickedCbs) {
            this._stopButtonClickedCbs = [];

            this._stopButton.addEventListener("click", () => {
                this._stopButtonClickedCbs.forEach(cb);
            });
        }
        this._stopButtonClickedCbs.push(cb);
    }

    get copyToButtonVisible() {
        !this._copyToButton.classList.contains("hidden");
    }
    set copyToButtonVisible(visible) {
        this._copyToButton.classList[visible ? "remove": "add"]("hidden");
    }
    get copyToButtonEnabled() {
        !this._copyToButton.disabled;
    }
    set copyToButtonEnabled(enable) {
        this._copyToButton.disabled = enable ? "" : "disabled";
    }
    onCopyToButtonClicked(cb) {
        if (!this._copyToButtonClickedCbs) {
            this._copyToButtonClickedCbs = [];

            this._copyToButton.addEventListener("click", () => {
                this._copyToButtonClickedCbs.forEach(cb);
            });
        }
        this._copyToButtonClickedCbs.push(cb);
    }

    get copyHereButtonVisible() {
        !this._copyHereButton.classList.contains("hidden");
    }
    set copyHereButtonVisible(visible) {
        this._copyHereButton.classList[visible ? "remove": "add"]("hidden");
    }
    onCopyHereButtonClicked(cb) {
        if (!this._copyHereButtonClickedCbs) {
            this._copyHereButtonClickedCbs = [];

            this._copyHereButton.addEventListener("click", () => {
                this._copyHereButtonClickedCbs.forEach(cb);
            });
        }
        this._copyHereButtonClickedCbs.push(cb);
    }
}

class ZeronetPartition extends ZeronetPartitionTemplate
{

    constructor(drive, partition) {
        super();

        this._drive = drive;
        this._partition = partition;

        this.headingBadge = ""; // remove once template dummy text is gone

        this.heading = partition.label || partition.device;

        this.text = `on ${drive.vendor} ${drive.model}`;
        if (partition.label) {
            this.text = "<strong>" + partition.device + "</strong> " + this.text;
        }

        this.filesystem = partition.filesystem;
        this.totalSize = partition.size;

        // Check if it's an sdcard
        if (drive.mediaCompatibility.some((item) => {
            return ["flash_sd", "flash_sdhc", "flash_mmc", "flash_sdxc"].includes(item);
        })) {
            this.icon = "sdcard";
        } else if (drive.connectionBus === "usb") {
            this.icon = "usbdev";
        } else {
            this.icon = "hdd";
        }

        this.startButtonVisible = false;
        this.stopButtonVisible = false;
        this.copyToButtonVisible = false;

        let currentZeronetUuidChanged = (uuid) => {
            if ((uuid && uuid === partition.uuid) || (!uuid && partition.mountpoint === "/")) {
                Zeronet.currentPartitionItem = this
            }
        };

        Zeronet.currentZeronetUuid().then(currentZeronetUuidChanged);
        Zeronet.onCurrentZeronetUuidChanged(currentZeronetUuidChanged);

        let updateIsMounted = () => {
            this.mounted = partition.mounted;

            if (partition.mounted) {
                // Since we're mounted now, how about updating the ZeroNet path and size in the UI
                // TODO this may race with the explicit mount+check+unmount we do on start
                this.checkZeronet().then(() => {}, () => {});
            }
        }
        partition.onMountpointChanged(updateIsMounted);
        updateIsMounted();

        let isSupportedFilesystem = SUPPORTED_FILESYSTEMS.includes(partition.filesystem);
        if (isSupportedFilesystem) {

            this.busy = true;

            // Helper promise that resolves immediately if mounted or mounts first
            new Promise((resolve, reject) => {
                if (partition.mounted) {
                    return resolve(partition.mountpoint);
                }

                partition.mount().then((mp) => {
                    partition.mountedForChecking = true;
                    resolve(mp);
                }, reject);
            }).then((mp) => {

                this.busy = true;

                // FIXME unmount only when both diskFree and checkZeronet have finished
                // Promise.all() doesn't seem to do the job, though?
                StorageUtils.diskFree(mp).then((freeSpace) => {
                    this.freeSpace = freeSpace;
                }, (err) => {
                    console.warn("Failed to get free space for", this._partition.device, "on", this._partition.mountpoint, err);
                });

                this.checkZeronet().then(() => {}, () => {}).finally(() => {
                    this.busy = false;

                    // Unmount again after having checked
                    // Give it some time to settle before trying to
                    setTimeout(() => {
                        if (partition.mountedForChecking) {
                            partition.mountedForChecking = false;
                            partition.unmount().then(() => {
                                console.log("Unmounted", partition.device, "again");
                            }, (err) => {
                                console.warn("Failed to unmount", partition.device, "after checking for ZeroNet", err);
                            });
                        }
                    }, 1000);
                });

            }, (err) => {
                console.warn("Failed to mount", partition.device, err);
                this.zeronet = "Failed to mount (" + err.message + ")";
            }).finally(() => {
                this.busy = false;
            });

        } else {
            this.zeronet = "ZeroNet is not supported on this file system";
        }
    }

    get status() {
        return this._status;
    }
    set status(status) {
        this.busy = false;
        //this.startButtonVisible = false;
        //this.stopButtonVisible = false;

        this.headingBadgeType = "";

        switch (status) {
        case "current": // TODO unused, remove
            this.headingBadge = "Current";
            this.headingBadgeType = "default";
            break;
        case "start":
        case "start-pre":
            this.headingBadge = "Starting";
            this.headingBadgeType = "info";
            this.busy = true;
            break;
        case "auto-restart":
            this.headingBadge = "Restarting";
            this.headingBadgeType = "warning";
            this.busy = true;
            break;
        case "stop-post":
        case "stop-sigterm":
        case "final-sigterm":
        case "stop-sigkill":
        case "final-sigkill": // does this exist?
            this.headingBadge = "Stopping";
            this.headingBadgeType = "warning";
            this.busy = true;
            break;
        case "running":
            this.headingBadge = "Running";
            this.headingBadgeType = "success";
            //this.stopButtonVisible = true;
            break;
        case "failed":
        case "dead":
            this.headingBadge = "";//"Not running";
            //this.startButtonVisible = true;
            this.checkLastUsed().then(() => {
                this._updateLastUsedInfo();
            }, (err) => {});
            break;
        case "":
            this.headingBadge = "";
            this.headingBadgeType = "";
            break;
        default:
            console.warn("Invalid ZeroNet state", status);
            this.headingBadge = status;
            this.headingBadgeType = "default";
            break;
        }

        this._status = status;
        this._updateLastUsedInfo();
    }

    checkZeronet() {
        return new Promise((resolve, reject) => {

            if (!this._partition.mounted) {
                return reject("Cannot check ZeroNet status without being mounted");
            }

            let mp = this._partition.mountpoint;
            // Special case for our built-in one
            if (mp == "/") {
                mp = "/opt/zeronet";
            }

            let path = mp + "/ZeroNet-master";

            StorageUtils.dirExists(path).then((exists) => {

                if (!exists) {
                    this.zeronet = "No ZeroNet found";
                    reject();
                    return;
                }

                // TODO only when there's more than one partition
                this.copyToButtonVisible = true;
                this.startButtonVisible = true;

                this.zeronetPath = path;

                // TODO Can I chain these promises rather than nesting them?
                StorageUtils.diskUsage(path).then((usage) => {
                    this.zeronet = `<strong>${LocaleUtils.formatSize(usage)}</strong> folder at ${path}`;

                    this.checkLastUsed();

                    resolve();
                }, (err) => {
                    console.warn("Failed to determine ZeroNet folder usage on", this._partition.mountpoint, "which is", this._partition.device, "in", path, err);
                    this.zeronet = "ZeroNet found";
                    resolve();
                });

            }, (err) => {
                console.warn("Failed to determine zeronet existance on", this._partition.mountpoint, "which is", this._partition.device, "in", path, err);
                this.zeronet = "Failed to check for ZeroNet (" + err.message + ")";
                reject();
            });
        })
    }

    checkLastUsed(path) {
        path = path || this.zeronetPath;
        if (!path) {
            throw new TypeError("Cannot determine last used without path");
        }

        return new Promise((resolve, reject) => {
            StorageUtils.mtime(path + "/data").then((result) => {
                // TODO proper locale but UI is English for now, so be consistent with that here
                this.lastUsed = result;
                resolve();
            }, (err) => {
                console.warn("Failed to determine last usage on", this._partition.mountpoint, "which is", this._partition.device, "in", path, err);
                this.lastUsed = undefined;
                reject(err);
            });
        });
    }

}

class Copier
{

    constructor() {
        Copier.DBUS_INTERFACE = "com.netrunner.zeronet.cockpit.copier";

        document.getElementById("cancel-target-selection").addEventListener("click", () => {
            this.targetSelectionMode = false;
        });
        document.getElementById("copyCancel").addEventListener("click", () => {
            alert("Not implemented yet");
            // sledgehammer, at least use PID of cockpit.spawn, if we can get that..
            //cockpit.spawn(["killall", "-9", "copy-zeronet"]);
        });

        this._popup = $("#copyPopup");

        this._heading = document.getElementById("copyHeading");
        this._progressBar = document.getElementById("copyProgressBar");
        this._progressBarLabel = document.getElementById("copyProgressBarLabel");
        this._label = document.getElementById("copyText");

        this._dbusUtils = new DBusUtils({bus: "session"});

        this._dbusUtils.onServiceRegistered((name) => {
            if (name === Copier.DBUS_INTERFACE) {
                this._serviceRegistered();
            }
        });
        this._dbusUtils.onServiceUnregistered((name) => {
            if (name === Copier.DBUS_INTERFACE) {
                if (!this._registered) {
                    return;
                }

                this._registered = false;
                this._hide();
            }
        });

        this._dbusUtils.isServiceRegistered(Copier.DBUS_INTERFACE).then((registered) => {
            if (registered) {
                // TODO get path and so on
                this._serviceRegistered();
            }
        }, (err) => {
            console.warn("Failed to check whether copier is already registered", err);
        });
    }

    start() {
        if (this._registered) {
            throw new TypeError("Cannot start copy while already copying");
        }

        return new Promise((resolve, reject) => {
            // NOTE Cannot use cockpit.spawn here as the process will exit as soon as the website closes or is reloaded
            // but we want the progress to carry on without is (which is what all the DBus reporting is for)
            let proc = cockpit.script(`/usr/bin/copy-zeronet '${this.fromPath}' '${this.toPath}'`).done((result) => {
                resolve();
            }).fail(reject);
        });
    }

    _serviceRegistered() {
        if (this._registered) {
            return;
        }

        this._registered = true;

        this._progress = -1;
        this._updateLabel();

        this._show();

        if (!this._copier) {
            this._copier = cockpit.dbus("com.netrunner.zeronet.cockpit.copier", {
                bus: "session"
            });
        }

        this._subscription = this._copier.subscribe({
            path: "/",
            interface: "com.netrunner.zeronet",
        }, (path, iface, signal, data) => {
            switch (signal) {
            case "Progress":
                this._progress = data[0]/data[1];
                this._filesCount = data[1];
                this._updateLabel();
                break;
            case "Finished":
                Zeronet.showMessage("success", "Successfully copied ZeroNet");
                break;
            case "Failed":
                ZeroNet.showMessage("danger", "Failed to copy ZeroNet: " + data[0]);
                console.warn("Failed to copy", data[0]);
                break;
            }
        });
    }

    _serviceUnregistered() {
        if (!this._registered) {
            return;
        }

        this._registered = false;

        if (this._subscription) {
            this._subscription.remove();
            this._subscription = null;
        }

        this._hide();
    }

    _updateLabel() {
        var text = "";

        if (this._filesCount > 0) {
            text = `Copying <strong>${this._filesCount} files</strong> from <strong>${this.fromPath}</strong> to </strong>${this.toPath}</strong>…`;
        } else {
            text = `Copying from <strong>${this.fromPath}</strong> to <strong>${this.toPath}</strong>`;
        }

        this._label.innerHTML = text;
    }

    _show() {
        this._popup.modal({
            backdrop: "static",
            keyboard: false
        });
    }

    _hide() {
        this._popup.modal("hide");
    }

    get targetSelectionMode() {
        return document.body.classList.contains("target-selection");
    }
    set targetSelectionMode(enable) {
        document.body.classList[enable ? "add" : "remove"]("target-selection");
    }

    set _progress(progress) {
        let percent = Math.round(progress * 100);
        if (percent >= 0 && percent <= 100) {
            this._progressBar.style.width = percent + "%";
            this._progressBarLabel.innerText = percent + " %";
        } else {
            this._progressBar.style.width = "100%";
            this._progressBarLabel.innerText = "–";
        }
        // TODO aria range
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

var zeronet = new Zeronet();

var devicesDiv = document.getElementById("devices");

var udisks = new UDisks();

/*udisks.onDriveRemoved((drivePath) => {
    console.log("DRIVE REMOVED", drivePath);
});

udisks.onDriveAdded((drive) => {
    console.log("DRIVE ADDED", drive);

    drive.partitions.then((parts) => {
        console.log("has parts", parts);
    }, (err) => {
        console.warn("failed to get parts for new drive", err);
    });
});*/

var mainBusy = document.getElementById("mainbusy");
mainBusy.classList.remove("hidden");

var copier = new Copier();

// Check for whether the external drive zeronet is on is present
Zeronet.currentZeronetUuid().then((uuid) => {
    if (!uuid) { // using internal one, all good
        return;
    }

    var partitionPromises = [];

    udisks.drives.then((drives) => {
        drives.forEach((drive) => {
            partitionPromises.push(drive.partitions);
        });
    }).then(() => {
        Promise.all(partitionPromises).then((partitions) => {

            // Array.flat(): Turns a [drive: [partition, partition], drive: [partition, partition]] into a flat [partition, partition, ...]
            // pretty new, only in FF 62 and Chrome 67

            if (!partitions.flat().some((partition) => {
                return partition.uuid === uuid;
            })) {
                Zeronet.showMessage("warning", "The partition last used for ZeroNet is currently not present in the system.");
                // Reset back to internal one
                Zeronet.setCurrentZeronetUuid("");
            }

        }, (err) => {
            console.warn("Failed to check for partition existance", err);
        });
    });

});

udisks.drives.then((drives) => {

    drives.forEach((drive) => {

        // FIXME for debugging
        if (!drive.removable) {
            return;
        }

        drive.partitions.then((partitions) => {

            mainBusy.classList.add("hidden");

            // Check if the current Zeronet partition is known, otherwise display a warning
            Zeronet.currentZeronetUuid().then((uuid) => {
                if (uuid && !partitions.some((partition) => {
                        return partition.uuid === uuid;
                    })) {
                    // FIXME This is called for every drive so we would always show this if there's more than one
                    //Zeronet.showMessage("warning", "The partition last used for ZeroNet is currently not present in the system.");
                }
            });

            partitions.forEach((partition) => {

                var uiPartiton = new ZeronetPartition(drive, partition);

                zeronet.getUnit().then((unit) => {

                    uiPartiton.onStartButtonClicked(() => {

                        uiPartiton.busy = true;

                        var targetUuid = partition.uuid;
                        // Special case for our built-in one
                        if (partition.mountpoint === "/") {
                            targetUuid = "";
                        }

                        // Update current zeronet uuid that will be run by the unit
                        Zeronet.setCurrentZeronetUuid(targetUuid).then(() => {

                            unit.start().then(() => {
                                // start success
                            }, (err) => {
                                Zeronet.showMessage("danger", "Failed to launch ZeroNet: " + err.message);
                            }).finally(() => {
                                uiPartiton.busy = false;
                            });

                        }, (err) => {
                            console.warn("Failed to change zeronet uuid", err);
                            Zeronet.showMessage("danger", "Failed to update configuration for what is the current ZeroNet: " + err.message);
                            uiPartiton.busy = false;
                        });

                    });

                    uiPartiton.onStopButtonClicked(() => {
                        uiPartiton.busy = true;
                        unit.stop().then(() => {
                            console.log("Stopped unit");
                        }, (err) => {
                            console.warn("Error stopping unit", err);
                            Zeronet.showMessage("danger", "Failed to stop ZeroNet: " + err.message);
                        }).finally(() => {
                            uiPartiton.busy = false;
                        });
                    });

                    uiPartiton.onCopyToButtonClicked(() => {

                        // Disallow copying onto ourself
                        document.querySelectorAll("[data-id='copyHereButton']").forEach((item) => {
                            // reset for all others
                            // TODO check fs and what not
                            item.classList.remove("hidden");
                        });
                        uiPartiton.copyHereButtonVisible = false;

                        copier.targetSelectionMode = true;
                        // also store uuid?
                        copier.fromPath = uiPartiton.zeronetPath;
                    });

                    uiPartiton.onCopyHereButtonClicked(() => {
                        // FIXME mount first
                        if (!partition.mountpoint) {
                            alert("Need to mount first, not implemented yet");
                            copier.targetSelectionMode = false;
                            return;
                        }

                        copier.toPath = partition.mountpoint;

                        copier.start().then(() => {
                            copier.targetSelectionMode = false; // TODO finally?
                        }, (err) => {
                            Zeronet.showMessage("warning", "Failed to start copying: " + err.message);
                            console.warn("Failed to start copy", err);
                            copier.targetSelectionMode = false;
                        });
                    });

                    var unitSubStateChanged = (newState) => {

                        var isCurrent = (Zeronet.currentPartitionItem === uiPartiton);
                        var isStopped = (newState === "failed" || newState === "dead");

                        if (isCurrent) {
                            uiPartiton.status = newState; // FIXME what about not installed
                            uiPartiton.startButtonVisible = isStopped;
                            uiPartiton.stopButtonVisible = (newState === "running");
                        }

                        // When running, the current must be stopped before anything else can be done
                        // like starting a different one or copying over
                        uiPartiton.startButtonEnabled = isStopped;
                        uiPartiton.copyToButtonEnabled = isStopped;

                        document.getElementById("openBtn").disabled = (newState === "running") ? "" : "disabled";
                    };

                    unit.onSubStateChanged(unitSubStateChanged);
                    unitSubStateChanged(unit.subState);

                }, (err) => {
                    console.warn("Failed to get unit", err);
                });


                // HACK to ensure sdcard comes first
                if (uiPartiton.icon === "sdcard") { // TODO introduce type enum of some sort
                    devicesDiv.insertBefore(uiPartiton.domElement, devicesDiv.firstChild);
                } else {
                    devicesDiv.appendChild(uiPartiton.domElement);
                }

            });

        });

    });

});

Zeronet.onCurrentPartitionItemChanged((partitionItem, oldItem) => {

    if (oldItem) {
        oldItem.status = "";
    }

    partitionItem.busy = true;

    zeronet.getUnit().then((unit) => {
        // FIXME disconnect "connection" when changes
        if (Zeronet.currentPartitionItem === partitionItem) {
            partitionItem.status = unit.subState;
        }
    }).finally(() => {
        partitionItem.busy = false;
    });
});
