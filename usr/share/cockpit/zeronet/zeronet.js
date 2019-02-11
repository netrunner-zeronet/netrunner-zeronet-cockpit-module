
class Zeronet
{

    static _unitName = "zeronet.service";

    _systemd = new Systemd();
    _udisks = new UDisks();

    _statusSpinner = $("#statusSpinner");
    _statusLabel = $("#statusLabel");
    _startStopBtn = $("#startStopBtn");
    _openBtn = document.getElementById("openBtn");
    _openSystemdBtn = document.getElementById("openSystemdBtn");

    _zeronetUnit = null;

    setupUi() {
        $(this._statusSpinner).toggle(true);
        this._startStopBtn.disabled = true;
        $(this._openBtn).toggle(false);

        this._openBtn.addEventListener("click", () => {
            window.open("http://" + window.location.hostname);
        });

        this._openSystemdBtn.addEventListener("click", () => {
            cockpit.jump('/system/services#/zeronet.service');
        });

        console.log(this._startStopBtn);
        this._startStopBtn.click(() => {
            if (!this._zeronetUnit) {
                throw new TypeError("Cannot toggle start without unit");
            }

            switch (this._zeronetUnit.subState) {
            case "running":
                this._zeronetUnit.stop().then(() => {
                    console.log("hallo")
                }, (err) => {
                    console.log("shit", err);
                });
                break;
            case "failed":
            case "dead":
                this._zeronetUnit.start().then(() => {
                    console.log("dead to life");
                }, (err) => {
                    console.log("shit", err);
                });
                break;
            }
        });

    }

    checkStatus() {
        return new Promise((resolve, reject) => {

            this._getUnit().then((unit) => {

                this._updateStateUi(unit);

            }, (err) => {
                console.warn("Failed to get zeronet systemd unit", err);
                this._statusLabel.innerText = "Error"; // not installed?
            }).finally(() => {
                this._statusSpinner.toggle(false);

                resolve();
            });
        });
    }

    _updateStateUi(unit) {
        console.log("UNIT CHANGE", unit.subState);

        var text = "";
        var color = "";
        var busy = false;
        var buttonText = "Start";

        switch (unit.subState) {
        case "start":
            text = "Starting...";
            color = "blue";
            break;

        case "stop-sigterm":
        case "final-sigterm":
            text = "Stopping...";
            color = "orange";
            break;

        case "running":
            text = "Running";
            color = "green";
            buttonText = "Stop";
            break;

        case "failed":
        case "dead":
            if (unit.canStart) {
                color = "gray";
                text = "Not running";
            } else {
                color = "red";
                text = "Not installed";
            }
            break;

        default:
            console.log("Don't know what to do with state", unit.subState);
            text = unit.subState;
        }

        $(this._openBtn).toggle(unit.subState === "running");
        // TODO canStop when running
        var enable = true;// unit.canStart && (unit.subState === "running" || unit.subState === "dead");
        this._startStopBtn.prop("disabled", !enable);

        this._statusLabel.css("color", color);
        this._statusLabel.text(text);
        this._statusSpinner.toggle(busy);
        this._startStopBtn.text(buttonText);
    }

    _getUnit() {
        return new Promise((resolve, reject) => {
            if (this._zeronetUnit) {
                return resolve(this._zeronetUnit);
            }

            this._systemd.getUnit(Zeronet._unitName).then((unit) => {
                this._zeronetUnit = unit;

                unit.onSubStateChanged(() => {
                    this._updateStateUi(unit);
                });

                resolve(unit);
            }, reject);
        });
    }

}

var zeronet = new Zeronet();
zeronet.setupUi();
zeronet.checkStatus();




var udisks = new UDisks();

udisks.removableDrives.then((drives) => {

    var usbDevices = document.getElementById("usbDevices");
    usbDevices.innerHtml = ""; // clear

    drives.forEach((drive) => {
        var headerDiv = document.createElement("div");
        headerDiv.className = "panel panel-default";
        headerDiv.innerHTML = `<div class='panel-heading'><b>USB Device: ${drive.vendor} ${drive.model}</b></div>`;
        usbDevices.appendChild(headerDiv);

        var partitionTable = document.createElement("table");
        partitionTable.className = "table";

        drive.partitions.forEach((partition) => {
            var partitionTr = document.createElement("tr");

            partitionTr.innerHTML = `
                <td><img src='usbdev.png'></td>
                <td>Device: ${partition.device}</td>
                <td>File System: ${partition.filesystem}</td>
                <td>Size: ${partition.size}</td>`;

            partitionTable.appendChild(partitionTr);

            // Created dynamically so we can keep a reference and update once the freeSpace promise finishes
            var freeSpaceTd = document.createElement("td");
            partitionTable.appendChild(freeSpaceTd);

            // TODO mount

            partition.mount().then((result) => {
                console.log("MAUNT", result);
            }, (err) => {
                console.warn("Failed to mount", err);
            });

            partition.freeSpace.then((freeSpace) => {
                freeSpaceTd.innerText = `Free: ${freeSpace}`;
            }, (err) => {
                console.warn("Failed to get free space for", partition.device, "on", partition.mountpoint, err);
                freeSpaceTd.innerText = "Free: ???";
            });

            var buttonTd = document.createElement("td");

            partition._button = document.createElement("button");
            partition._button.className = "btn btn-default btn-secondary";

            buttonTd.appendChild(partition._button);

            partitionTable.appendChild(buttonTd);
            // Created dynamically so we can add and remove buttons


        });

        usbDevices.appendChild(partitionTable);

        console.log("USB DRIVE:", drive.vendor, drive.model);

        drive.partitions.forEach((partition) => {
            console.log("  Partition", partition.label, "on", partition.device);
        });


    });
}, (err) => {
    console.warn("ERR", err);
});
