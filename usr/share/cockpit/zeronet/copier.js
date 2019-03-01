
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

            cockpit.user().done((user) => {

                // NOTE Cannot use cockpit.spawn here as the process will exit as soon as the website closes or is reloaded
                // but we want the progress to carry on without is (which is what all the DBus reporting is for)
                let script = `/usr/bin/copy-zeronet '${this.fromPath}' '${this.toPath}'`;
                // HACK needed since as superuser we cannot access this user's DBus stuff
                let environ = [
                    "XDG_RUNTIME_DIR=/run/user/" + user.id,
                    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/" + user.id + "/bus"
                ]
                let proc = cockpit.script(script, [] /*args*/, {
                    superuser: "try",
                    environ: environ
                }).done((result) => {
                    resolve();
                // TODO check if we need this since we get a Finished signal
                // but might not be connected (when copy finishes too qucikly)
                }).fail(reject);
                //proc.stream(console.log);
            });
        });
    }

    cancel() {
        return new Promise((resolve, reject) => {
            // copier exits right after calling Cancel without replying, so this call technically always fails, hence fail(resolve)
            this._client().call("/", Copier.DBUS_INTERFACE, "Cancel").done(resolve).fail(resolve);
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
                    let result = data[0];
                    this._finishedCbs.forEach((cb) => {
                        cb(result);
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
