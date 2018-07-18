var stat = $("#stat");
var btn = $("#start");
var openBtn = $("#open");
var isRunning = false;

var SYSTEMD_BUSNAME = "org.freedesktop.systemd1"

var systemd_client = cockpit.dbus(SYSTEMD_BUSNAME, { superuser: "try" });
var systemd_manager = systemd_client.proxy("org.freedesktop.systemd1.Manager",
					   "/org/freedesktop/systemd1"); 

function checkStatus() {
  //var proc2 = cockpit.spawn(["zeronet-startstop.sh", "-status"]);
  //proc2.done(status_success);
  //proc2.fail(status_fail);
  var unit;
  systemd_manager.call("GetUnit", [ "zeronet.service" ]).
  done(function (result) {
    console.log(result[0]);
    unit = result
    systemd_client.call(unit[0], "org.freedesktop.DBus.Properties", "Get", [ "org.freedesktop.systemd1.Unit", "SubState" ]).
    done(function (result) {
      var state = result[0].v;
      console.log("Zeronet Service subState: " + state);
      if (state == "running") {
	isRunning = true;
	status_success();
      }
      else {
	isRunning = false;
	status_fail();
      }
    }).
    fail(function (error) {
      console.log(error)
    });
  });
  
}

checkStatus();

$("#start").on("click", zeronet_run);
$("#open").on("click", open_zeronet);

function zeronet_run() {
  //var proc = cockpit.spawn(["zeronet-startstop.sh"]);
  //proc.done(zeronet_success);
  //proc.stream(zeronet_output);
  //proc.fail(zeronet_fail);
  stat.empty();
  if (!isRunning) {
    systemd_manager.call("StartUnit", [ "zeronet.service", "replace" ]). 
    done(function (result) {
      console.log("Zeronet.service start: " + result);
      zeronet_success();
    }).
    fail(function (error) {
      console.log(error);
      zeronet_fail();
      // Maybe some other error message that indicates that the service is not installed
    });
  }
  else {
    systemd_manager.call("StopUnit", [ "zeronet.service", "replace" ]). 
    done(function (result) {
      console.log("Zeronet.service stop: " + result);
      zeronet_success();
    }).
    fail(function (error) {
      console.log(error);
      zeronet_fail();
      // Maybe some other error message that indicates that the service is not installed
    });
  }
}

function open_zeronet() {
  var proc = cockpit.spawn(["hostname"]);
  proc.done(hostname_success);
}

function hostname_success(data) {
  window.open("http://" + data);
}

function zeronet_success() {
  stat.css("color", "green");
  stat.text("checking...");
  checkStatus();
}

function zeronet_fail() {
  stat.css("color", "red");
  stat.text("not running");
  checkStatus();
}

function status_success() {
  stat.css("color", "green");
  stat.text("running");
  btn.text("Stop");
  openBtn.show();
}

function status_fail() {
  stat.css("color", "red");
  stat.text("not running");
  btn.text("Start");
  openBtn.hide();
}
