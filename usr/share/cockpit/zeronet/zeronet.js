
const ZERONET_UNITNAME = "zeronet.service";
const SUPPORTED_FILESYSTEMS = ["ext3", "ext4", "xfs", "btrfs", "ntfs"];

const DEFAULT_ZERONET_FOLDER = "/opt/zeronet/ZeroNet-master"

class Zeronet
{

    static currentZeronetPath() {
        return new Promise((resolve, reject) => {
            if (this._currentZeronetPath) {
                return resolve(this._currentZeronetPath);
            }

            // Check whether it's a symlink to somewhere else
            StorageUtils.symlinkTarget(DEFAULT_ZERONET_FOLDER).then((path) => {
                if (path) {
                    this._currentZeronetPath = path;
                } else { // No symlink, is currently the default
                    this._currentZeronetPath = DEFAULT_ZERONET_FOLDER;
                }
                resolve(this._currentZeronetPath);
            }, (err) => {
                console.warn("Failed to determine current ZeroNet folder", err);
            });
        });
    }

    static onCurrentZeronetPathChanged(cb) {
        if (!Zeronet._currentZeronetPathChangedCbs) {
            Zeronet._currentZeronetPathChangedCbs = [];
        }
        Zeronet._currentZeronetPathChangedCbs.push(cb);
    }

    static get currentPartitionItem() {
        return Zeronet._currentPartitionItem;
    }
    static set currentPartitionItem(newItem) {
        var oldItem = Zeronet._currentPartitionItem;
        Zeronet._currentPartitionItem = newItem;

        console.log("SET IT TO", newItem, "TELL", Zeronet._currentPartitionItemChangedCbs);
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

                /*unit.onSubStateChanged(() => {
                    this._updateStateUi(unit);
                });*/

                resolve(unit);
            }, reject);
        });
    }

}

class ZeronetPartitionTemplate
{

    constructor() {
        var html = `
<div class="list-view-pf-actions">
    <button class="btn btn-primary" data-id="startButton">Start</button>
    <button class="btn btn-primary" data-id="stopButton">Stop</button>
    <button class="btn btn-default" data-id="copyButton">Copy to…</button>
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
                <span data-id="heading">TEMPLATE HEADING</span>
                <span data-id="heading-badge" class="label">TEMPLATE HEADING BADGE</span>
                <span data-id="busy-indicator" class="spinner spinner-sm spinner-inline"></span>
            </div>
            <div class="list-group-item-text" data-id="text">TEMPLATE TEXT</div>

            <div class="progress progress-xs" data-id="progress-bar-container">
                <div class="progress-bar" data-id="progress-bar"></div>
            </div>
        </div>

        <div class="list-view-pf-additional-info">
            <div class="list-view-pf-additional-info-item" data-id="free-space-info-container">
                <span class="pficon pficon-volume"></span>
                <span data-id="free-space-info">TEMPLATE FREE SPACE</span>
            </div>
            <div class="list-view-pf-additional-info-item">
                <span class="pficon pficon-cluster"></span>
                <span data-id="filesystem-info">TEMPLATE FS INFO</span>
            </div>
            <div class="list-view-pf-additional-info-item">
                <span class="pficon pficon-network"></span>
                <span data-id="zeronet-info">TEMPLATE ZERONET INFO</span>
            </div>
        </div>
    </div>
</div>`;

        this._domElement = UiUtils.createElementWithClassName("div", "list-group-item");
        this._domElement.innerHTML = html;

        this._startButton = this._findDomItem("startButton");
        this._stopButton = this._findDomItem("stopButton");
        this._copyButton = this._findDomItem("copyButton");

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
        this._zeronetInfo = this._findDomItem("zeronet-info");

        this._updateSpaceInfo();
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

    get icon() {
        // TODO
    }
    set icon(icon) {
        this._iconElement.src = "style/" + icon + ".svg";
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
        this._zeronetInfo.innerHTML = zn;
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
    onStopButtonClicked(cb) {
        if (!this._stopButtonClickedCbs) {
            this._stopButtonClickedCbs = [];

            this._stopButton.addEventListener("click", () => {
                this._stopButtonClickedCbs.forEach(cb);
            });
        }
        this._stopButtonClickedCbs.push(cb);
    }

    get copyButtonVisible() {
        !this._copyButton.classList.contains("hidden");
    }
    set copyButtonVisible(visible) {
        this._copyButton.classList[visible ? "remove": "add"]("hidden");
    }
    onCopyButtonClicked(cb) {
        if (!this._copyButtonClickedCbs) {
            this._copyButtonClickedCbs = [];

            this._copyButton.addEventListener("click", () => {
                this._copyButtonClickedCbs.forEach(cb);
            });
        }
        this._copyButtonClickedCbs.push(cb);
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
        this.copyButtonVisible = false;

        let isSupportedFilesystem = SUPPORTED_FILESYSTEMS.includes(partition.filesystem);
        if (isSupportedFilesystem) {

            // Helper promise that resolves immediately if mounted or mounts first
            new Promise((resolve, reject) => {
                if (partition.mounted) {
                    return resolve();
                }

                partition.mount().then(resolve, reject);
            }).then(() => {

                StorageUtils.diskFree(partition.mountpoint).then((freeSpace) => {
                    this.freeSpace = freeSpace;
                }, (err) => {
                    console.warn("Failed to get free space for", partiton.device, "on", partition.mountpoint, err);
                });

                // FIXME check multiple locations on a drive
                // perhaps just list all with "ZeroNet-master" name
                // and also take into account the /opt sdcard thing

                var mp = partition.mountpoint;
                if (mp == "/") {
                    // Special case for built-in SD
                    mp = "/opt/zeronet";
                }

                var path = mp + "/ZeroNet-master";

                StorageUtils.dirExists(path).then((exists) => {
                    console.log("has zeronet here", partition.mountpoint, path, exists);

                    if (!exists) {
                        this.zeronet = "No ZeroNet found";
                        return;
                    }

                    StorageUtils.diskUsage(path).then((usage) => {
                        this.zeronet = `<strong>${LocaleUtils.formatSize(usage)}</strong> folder at ${path}`;
                    }, (err) => {
                        console.warn("Failed to determine ZeroNet folder usage on", partition.mountpoint, "which is", partition.device, "in", path, err);
                        this.zeronet = "ZeroNet found";
                    });

                    // Now check if this is our current instance
                    Zeronet.currentZeronetPath().then((currentPath) => {

                        if (path == currentPath) {
                            Zeronet.currentPartitionItem = this;
                        }

                    }, (err) => {
                        console.warn("Failed to determine current zeronet path");
                    });

                }, (err) => {
                    console.warn("Failed to determine zeronet existance on", partition.mountpoint, "which is", partition.device, "in", path, err);
                });
            }, (err) => {
                console.warn("Failed to mount", partition.device, err);
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
        this.startButtonVisible = false;
        this.stopButtonVisible = false;

        this.headingBadgeType = "";

        switch (status) {
        case "current":
            this.headingBadge = "Current";
            this.headingBadgeType = "default";
            break;
        case "start":
            this.headingBadge = "Starting";
            this.headingBadgeType = "info";
            this.busy = true;
            break;
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
            this.stopButtonVisible = true;
            break;
        case "failed":
        case "dead":
            this.headingBadge = "";//"Not running";
            this.startButtonVisible = true;
            break;
        default:
            throw new TypeError("Invalid ZeroNet state", status);
        }

        this._status = status;
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

udisks.onDriveRemoved((drivePath) => {
    console.log("DRIVE REMOVED", drivePath);
});

udisks.onDriveAdded((drive) => {
    console.log("DRIVE ADDED", drive);

    drive.partitions.then((parts) => {
        console.log("has parts", parts);
    }, (err) => {
        console.warn("failed to get parts for new drive", err);
    });
});

udisks.drives.then((drives) => {

    drives.forEach((drive) => {

        // FIXME for debugging
        if (!drive.removable) {
            return;
        }

        drive.partitions.then((partitions) => {

            partitions.forEach((partition) => {

                console.log(partition);

                var uiPartiton = new ZeronetPartition(drive, partition);

                zeronet.getUnit().then((unit) => {

                    uiPartiton.onStartButtonClicked(() => {
                        unit.start().then(() => {
                            console.log("Started unit");
                        }, (err) => {
                            console.log("error starting", err);
                        });
                    });

                    uiPartiton.onStopButtonClicked(() => {
                        unit.stop().then(() => {
                            console.log("Stopped unit");
                        }, (err) => {
                            console.log("error stopping", err);
                        });
                    });

                    unit.onSubStateChanged((newState) => {
                        console.log("SUBST CH", newState);
                        if (Zeronet.currentPartitionItem === uiPartiton) {
                            uiPartiton.status = newState; // FIXME what about not installed
                        }
                    });

                }, (err) => {
                    console.warn("Failed to get unit", err);
                });



                devicesDiv.appendChild(uiPartiton.domElement);

            });

        });

    });

});

Zeronet.onCurrentPartitionItemChanged((partitionItem, oldItem) => {

    if (oldItem) {
        oldItem.status = "";
    }

    partitionItem.status = "current";
    partitionItem.busy = true;

    zeronet.getUnit().then((unit) => {
        // FIXME disconnect "connection" when changes
        if (Zeronet.currentPartitionItem === partitionItem) {
            if ((unit.subState === "failed" || unit.subState === "dead") && !unit.canStart) {
                partitionItem.status = "notinstalled";
            } else {
                partitionItem.status = unit.subState;
            }
        }
    }).finally(() => {
        partitionItem.busy = false;
    });
});
