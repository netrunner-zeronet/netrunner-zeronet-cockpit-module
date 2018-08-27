#!/bin/bash

BLOCK_DEVICES=$(lsblk -p -S -o  NAME,TRAN  | grep usb | awk '{print $1}')
ORIG_LOCATION=/opt/zeronet/ZeroNet-master
PLASMA_CONFIG_LOCATION=~/.config/plasma-org.kde.plasma.desktop-appletsrc

function setLocation() {
  LOC=$1
  # Sed'ing is a bad idea and also for some reason does not work for me
  #sed -i -e "s|^zeronetLocation=.*\$|zeronetLocation=$LOC|" $PLASMA_CONFIG_LOCATION
  #sleep 2;
  #sed -i -e "s|^zeronetLocation\[\$e\]=.*\$|zeronetLocation[\$e]=$LOC|" $PLASMA_CONFIG_LOCATION
  # Linking instead
  sudo mv $ORIG_LOCATION{,-backup}
  sudo ln -s $LOC $ORIG_LOCATION
}

function cpZeronet() {
  NEW_LOCATION=$1
  echo "Copying Zeronet to new location: $NEW_LOCATION ..."
  sudo cp -a $ORIG_LOCATION $NEW_LOCATION
}

function showPartitions() {
  for USBDISKS in $BLOCK_DEVICES; do
    DISK=${USBDISKS##*/}
    PART=$(lsblk --list -n -oNAME,TYPE | grep part | grep -v zram | grep $DISK | awk '{print $1}')
    echo $PART
  done
}

function getFs() {
  PART=$1
  FS=$(lsblk --list -fs -n -oNAME,TYPE,FSTYPE | grep part | grep -v zram | grep $PART | awk '{print $3}')
  echo $FS
}

function getSize() {
  PART=$1
  SIZE=$(lsblk --list -fs -n -oNAME,TYPE,SIZE | grep part | grep -v zram | grep $PART | awk '{print $3}')
  echo $SIZE
}

function mountPartitions() {
  PART=/dev/$1
  MNTPNT=$2
  sudo mount $PART $2 2>&1 > /dev/null
}

function add2fstab() {
  PART=/dev/$1
  MNTPNT=$2
  FS=$(getFs $1)
  sudo mkdir -p $MNTPNT
  echo "$PART                                     $MNTPNT          $FS    defaults,nofail,x-systemd.device-timeout=4 0 0" | sudo tee --append /etc/fstab > /dev/null
}

function restartPlasma() {
echo "Restarting Plasma..."
kquitapp5 plasmashell
sleep 2;
plasmashell 2>&1 > /dev/null
}

function install() {
 INPUT_PART=$(echo $1 | sed -e "s|^/dev/||")
 add2fstab $INPUT_PART /mnt/zeronet-usb
 mountPartitions $INPUT_PART /mnt/zeronet-usb
 cpZeronet /mnt/zeronet-usb/
 setLocation /mnt/zeronet-usb/ZeroNet-master
 echo "Configuration finished. Please restart Zeronet."
}

function uninstall() {
echo "Undo external zeronet"
sudo rm /opt/zeronet/ZeroNet-master
sudo mv /opt/zeronet/ZeroNet-master-backup /opt/zeronet/ZeroNet-master
echo " " | sudo tee /etc/fstab 
}

function listJson() {
  JSON="{ \"disks\": ["
  arr=($(showPartitions))
  vars=(${arr[@]})
  len=${#arr[@]}
  for (( i=0; i<=len; i++ )); do
  if [ $i -lt $len ] && [ $i != 0 ]; then 
     JSON="$JSON ,"
  elif [ $i == $len ]; then 
     JSON="$JSON ]}"
     echo $JSON
     exit 0
  fi
  JSON="$JSON { \"name\": \"${vars[i]}\", \"dev\": \"/dev/${vars[i]}\", \"size\": \"$(getSize ${vars[i]})\", \"fs\": \"$(getFs ${vars[i]})\" }"
  done
}

function show_menu() {
clear
echo ""
echo "This script will allow you to copy zeronet onto a usb device and use it from there."
echo "Please choose which disk & partition you want to use:"
echo "Available partitions:"
PARTS=$(showPartitions)
echo $PARTS
read -p "Enter partition: " INPUT_PART
case "$PARTS" in
      *$INPUT_PART*)
        add2fstab $INPUT_PART /mnt/zeronet-usb
        mountPartitions $INPUT_PART /mnt/zeronet-usb
        cpZeronet /mnt/zeronet-usb/
        setLocation /mnt/zeronet-usb/ZeroNet-master
        ;;
      *) echo "Error. You can only enter one of the listed partitions" ;;
esac
}

if [[ "$1" == "-u" ]]; then
  uninstall
elif [[ "$1" == "-i" ]] && [[ ! -z "$2" ]]; then
  install $2
elif [[ "$1" == "--list-partitions" ]] || [[ "$1" == "-l" ]]; then
  showPartitions
elif [[ ("$1" == "--get-fs" || "$1" == "-g") &&  ! -z "$2" ]] ; then
   getFs $2
elif [[ ("$1" == "--get-size" || "$1" == "-s") &&  ! -z "$2" ]] ; then
   getSize $2
elif [[ ("$1" == "--list-json" || "$1" == "-j") ]] ; then
   listJson
else
  show_menu
fi
