
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

    // Mounts a partition if not mounted or just resolves if already mounted
    static mount(partition) {
        return new Promise((resolve, reject) => {
            if (partition.mounted) {
                // would be nice to also pass the mountpoint
                // but promise handlers don't support multi-arg
                return resolve(false /*wasMounted*/);
            }

            partition.mount().then((mp) => {
                resolve(true /*wasMounted*/);
            }, (err) => {
                reject(err);
            });
        });
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

        this.drive = drive;
        this.partition = partition;

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

            Zeronet.mount(partition).then((wasMounted) => {
                let mp = partition.mountpoint;

                partition.mountedForChecking = wasMounted;

                this.busy = true;

                // FIXME unmount only when both diskFree and checkZeronet have finished
                // Promise.all() doesn't seem to do the job, though?
                StorageUtils.diskFree(mp).then((freeSpace) => {
                    this.freeSpace = freeSpace;
                }, (err) => {
                    console.warn("Failed to get free space for", this.partition.device, "on", this.partition.mountpoint, err);
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

            if (!this.partition.mounted) {
                return reject("Cannot check ZeroNet status without being mounted");
            }

            let mp = this.partition.mountpoint;
            // Special case for our built-in one
            if (mp == "/") {
                mp = "/opt/zeronet";
            }

            let path = mp + "/ZeroNet-master";

            StorageUtils.dirExists(path).then((exists) => {

                if (!exists) {
                    this.startButtonVisible = false;
                    this.zeronet = "No ZeroNet found";
                    this.zeronetPath = "";
                    // reject?
                    resolve(false);
                    return;
                }

                this.copyToButtonVisible = true;
                // TODO only when there's more than one partition
                this.startButtonVisible = true;

                this.zeronetPath = path;

                // TODO Can I chain these promises rather than nesting them?
                StorageUtils.diskUsage(path).then((usage) => {
                    this.zeronet = `<strong>${LocaleUtils.formatSize(usage)}</strong> folder at ${path}`;
                    this.zeronetSize = usage;

                    this.checkLastUsed();

                    resolve(true);
                }, (err) => {
                    console.warn("Failed to determine ZeroNet folder usage on", this.partition.mountpoint, "which is", this.partition.device, "in", path, err);
                    this.zeronet = "ZeroNet found";
                    resolve(true);
                });

            }, (err) => {
                console.warn("Failed to determine zeronet existance on", this.partition.mountpoint, "which is", this.partition.device, "in", path, err);
                this.zeronet = "Failed to check for ZeroNet (" + err.message + ")";
                reject();
            });
        })
    }

    checkLastUsed(path) {
        return new Promise((resolve, reject) => {
            path = path || this.zeronetPath;
            if (!path) {
                return reject("Cannot determine last used without path");
            }

            StorageUtils.mtime(path + "/data").then((result) => {
                // TODO proper locale but UI is English for now, so be consistent with that here
                this.lastUsed = result;
                resolve();
            }, (err) => {
                console.warn("Failed to determine last usage on", this.partition.mountpoint, "which is", this.partition.device, "in", path, err);
                this.lastUsed = undefined;
                reject(err);
            });
        });
    }

}

class Copier
{

    constructor() {
        Copier.DBUS_SERVICE = "com.netrunner.zeronet.cockpit.copier";
        Copier.DBUS_INTERFACE = "com.netrunner.zeronet"

        document.getElementById("cancel-target-selection").addEventListener("click", () => {
            this.targetSelectionMode = false;
        });
        document.getElementById("copyCancel").addEventListener("click", () => {
            copier.cancel();
        });

        this._popup = $("#copyPopup");

        this._heading = document.getElementById("copyHeading");
        this._progressBar = document.getElementById("copyProgressBar");
        this._progressBarLabel = document.getElementById("copyProgressBarLabel");
        this._label = document.getElementById("copyText");

        this._dbusOptions = {
            bus: "session"
        };

        this._dbusUtils = new DBusUtils(this._dbusOptions);

        this._dbusUtils.onServiceRegistered((name) => {
            if (name === Copier.DBUS_SERVICE) {
                this._serviceRegistered();
            }
        });
        this._dbusUtils.onServiceUnregistered((name) => {
            if (name === Copier.DBUS_SERVICE) {
                this._serviceUnregistered();
            }
        });

        this._dbusUtils.isServiceRegistered(Copier.DBUS_SERVICE).then((registered) => {
            if (registered) {

                this._client().call("/", Copier.DBUS_INTERFACE, "Info").then((data) => {
                    let info = data[0];
                    copier.fromPath = info.fromPath.v;
                    copier.toPath = info.toPath.v;
                    copier.filesCount = info.filesCount.v;

                    this._serviceRegistered();
                }).fail((err) => {
                    console.warn("Failed to get info about running copy progress", err);
                    Zeronet.showMessage("warning", "A copy operation is in progress but getting information about it failed: " + err.message);
                });
            }
        }, (err) => {
            console.warn("Failed to check whether copier is already registered", err);
        });
    }

    _client() {
        if (!this._dbusClient) {
            this._dbusClient = cockpit.dbus(Copier.DBUS_SERVICE, this._dbusOptions);
        }
        return this._dbusClient;
    }

    start() {
        return new Promise((resolve, reject) => {
            if (this._registered) {
                return reject("Cannot start copy while already copying");
            }

            // NOTE Cannot use cockpit.spawn here as the process will exit as soon as the website closes or is reloaded
            // but we want the progress to carry on without is (which is what all the DBus reporting is for)
            let cmd = `/usr/bin/copy-zeronet '${this.fromPath}' '${this.toPath}'`;
            console.log("Start copy", cmd, {superuser: "try"});
            let proc = cockpit.script(cmd).done((result) => {
                resolve();
            // TODO check if we need this since we get a Finished signal
            // but might not be connected (when copy finishes too qucikly)
            }).fail((err) => {
                reject(err);
            });
            //proc.stream(console.log);
        });
    }

    cancel() {
        return new Promise((resolve, reject) => {
            this._client().call("/", Copier.DBUS_INTERFACE, "Cancel").done(resolve).fail(reject);
        });
    }

    onStarted(cb) {
        if (!this._startedCbs) {
            this._startedCbs = [];
        }
        this._startedCbs.push(cb);
    }
    onFinished(cb) {
        if (!this._finishedCbs) {
            this._finishedCbs = [];
        }
        this._finishedCbs.push(cb);
    }
    onFailure(cb) {
        if (!this._failureCbs) {
            this._failureCbs = [];
        }
        this._failureCbs.push(cb);
    }

    _serviceRegistered() {
        if (this._registered) {
            return;
        }

        if (this._startedCbs) {
            this._startedCbs.forEach((cb) => {
                cb();
            });
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
                this.filesCount = data[1];
                this._updateLabel();
                break;
            case "Finished":
                if (this._finishedCbs) {
                    let withError = data[0];
                    let err = data[1];
                    this._finishedCbs.forEach((cb) => {
                        if (withError) {
                            cb(true, err);
                        } else {
                            cb(false);
                        }
                    });
                }
                break;
            case "Failure":
                let path = data[0];
                let err = data[1];
                if (this._failureCbs) {
                    this._failureCbs.forEach((cb) => {
                        cb(path, err);
                    });
                }
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

        if (this.filesCount > 0) {
            text = `Copying <strong>${this.filesCount} files</strong> from <strong>${this.fromPath}</strong> to </strong>${this.toPath}</strong>…`;
        } else {
            text = `Copying from <strong>${this.fromPath}</strong> to <strong>${this.toPath}</strong>…`;
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
copier.onFinished((withError) => {
    if (withError) {
        if (copier.failedPaths) {
            if (copier.failedPaths.length === 1) {
                Zeronet.showMessage("warning", `Failed to copy <strong>${copier.failedPaths[0]}</strong>.`);
            } else {
                // let user see which files?
                Zeronet.showMessage("warning", `Failed to copy <strong>${copier.failedPaths.length} ZeroNet files</strong> out of ${copier.filesCount}.`);
            }
        } else {
            Zeronet.showMessage("warning", "Failed to copy ZeroNet");
        }
    } else {
        Zeronet.showMessage("success", `Successfully copied ZeroNet to <strong>${copier.toPath}</strong>`);
    }
});
copier.onStarted(() => {
    copier.failedPaths = [];
});
copier.onFailure((path, err) => {
    //console.warn("Failed to copy", path, err);

    if (!copier.failedPaths) {
        copier.failedPaths = [];
    }
    copier.failedPaths.push(path);
});

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
                            // TODO disallow copying to internal sd
                            item.classList.remove("hidden");
                        });
                        uiPartiton.copyHereButtonVisible = false;

                        copier.targetSelectionMode = true;

                        copier.fromUuid = partition.uuid;
                        copier.fromUiPartition = uiPartiton;
                        copier.fromPath = uiPartiton.zeronetPath;
                    });

                    uiPartiton.onCopyHereButtonClicked(() => {
                        if (!copier.fromUuid || !copier.fromUiPartition) {
                            throw new TypeError("Cannot copy here without copy to");
                        }

                        uiPartiton.busy = true;

                        copier.targetSelectionMode = false;

                        // TODO also mount source partition and check it so that zeronetSize is up to date

                        Zeronet.mount(copier.fromUiPartition.partition).then((wasMounted) => {

                            copier.fromUiPartition.partition.mountedForCopying = wasMounted;

                        }).then(() => {

                            return copier.fromUiPartition.checkZeronet();

                        }).then(() => {

                            if (!copier.fromUiPartition.zeronetPath) { // shouldn't happen
                                return reject("No ZeroNet on source");
                            }

                            return Zeronet.mount(partition);

                        }).then((wasMounted) => {

                            partition.mountedForCopying = wasMounted;

                        }).then(() => {

                            return uiPartiton.checkZeronet();

                        }).then(() => {

                            return new Promise((resolve, reject) => {

                                if (uiPartiton.zeronetPath) {
                                    let newName = "ZeroNet-master_";
                                    // FIXME make sure the new path also doesn't exist
                                    if (uiPartiton.lastUsed) {
                                        // lol
                                        newName += uiPartiton.lastUsed.toISOString().slice(0, 16).replace(/[\-\:]/g, "").replace("T", "-");
                                    } else {
                                        newName = "old";
                                    }

                                    let renamePopup = $("#copyRenamePopup");

                                    let accepted = false;

                                    renamePopup.on("hidden.bs.modal", () => {
                                        if (accepted) {

                                            // can we add this to the chain, too?
                                            return StorageUtils.move(uiPartiton.zeronetPath,
                                                                     uiPartiton.zeronetPath.replace("/ZeroNet-master", "/" + newName))
                                                                     .then(resolve, reject);

                                        } else {
                                            reject("Canceled");
                                        }
                                    });

                                    document.getElementById("copyResultPopupSuggestedName").innerText = newName;

                                    // FIXME return key
                                    document.getElementById("copyRenameAccept").addEventListener("click", () => {
                                        accepted = true;
                                        renamePopup.modal("hide");
                                    });

                                    renamePopup.modal("show");

                                    return;
                                }

                                resolve();

                            });

                        }).then(() => {

                            return StorageUtils.diskFree(partition.mountpoint);

                        }).then((freeSpace) => {

                            uiPartiton.freeSpace = freeSpace;

                            return new Promise((resolve, reject) => {
                                // add 5% contingency space
                                if (uiPartiton.freeSpace < copier.fromUiPartition.zeronetSize * 1.05) {
                                    // TODO tell user how much more is needed
                                    return reject("Insufficient free space");
                                }

                                copier.toUuid = partition.uuid;
                                copier.toUiPartition = uiPartiton;
                                copier.toPath = partition.mountpoint + "/ZeroNet-master";
                                resolve();
                            });

                        }).then(() => {

                            return copier.start()

                        }).then(() => {
                            //
                        }, (err) => {
                            Zeronet.showMessage("warning", "Failed to start copying: " + err);
                            console.warn("Failed to start copy", err);
                        }).finally(() => {
                            uiPartiton.busy = false;
                        });

                    });

                    copier.onFinished(() => {
                        // should we unmount again?
                        /*if (partition.mountedForCopying
                            && ((copier.fromUuid && copier.fromUuid === partition.uuid) || (copier.toUuid && copier.toUuid === partition.uuid))) {
                            console.log("Unmount", partition, "after copying finished");
                            partition.unmount().then(() => {}, (err) => { console.warn("Failed to unmount", partition, "after copying", err); });
                        }*/

                        if (copier.toUuid === partition.uuid) {
                            uiPartiton.checkZeronet();
                        }
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
