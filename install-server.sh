##################################################################################
#!/bin/bash
# To install: wget -P /tmp -L https://raw.githubusercontent.com/hodlerhacks/ccc-installer/master/install-server.sh; bash /tmp/install-server.sh
##################################################################################
VERSION="1.0.1"
APPPATH=/var/opt
INSTALLERFOLDER=ccc-installer
APPSCRIPTREPOSITORY=https://github.com/hodlerhacks/ccc-installer.git
APPMANAGER=app-manager.js
APPNAME=App-Manager
##################################################################################
bashrc_shortcuts=(installer)
installer="'bash "$APPPATH"/"$INSTALLERFOLDER"/install-server.sh'"
##################################################################################

write_bashrc_shortcut() {
	all_args=("$@")
	rest_args=("${all_args[@]:1}")
	shortcut_cmd="${rest_args[@]}"

 	sed -i "s|^alias $1.*|alias $1=$shortcut_cmd|gI" ~/.bashrc
}

update_bashrc_shortcuts() {
	for i in "${bashrc_shortcuts[@]}"
		do
			eval shortcut_string=\$$i
			write_bashrc_shortcut $i $shortcut_string
	done
}

check_bashrc_shortcuts() {
	for i in "${bashrc_shortcuts[@]}"
		do	
			if grep -q $i ~/.bashrc; then
				echo "Alias "$i" exist"
				update_bashrc_shortcuts
			else	
				eval shortcut_string=\$$i
				echo "Alias does not exist!!"
				echo "alias "$i"="$shortcut_string >> ~/.bashrc
			fi
	done
}

check_installation() {
	# If node_modules is not available
	if [ ! -d "$APPPATH"/"$INSTALLERFOLDER"/node_modules ]; then
		clear
		echo ""
		echo "  Application Manager has not been installed yet"
		echo ""
		echo "  Starting installation..."
		echo ""

		press_enter
		app_install
	fi
}

start_app() { 
	echo "Starting App Manager..."
	echo ""

	check_installation

	# If already exists and running, just show it's already running
	if [ "$(pm2 list 2> /dev/null | grep $APPNAME | grep -o online)" = "online" ]; then
		pm2 list
	else
		pm2 start "app-manager.js" --name="$APPNAME"
		pm2 save
	fi
}

restart_app() { 
	echo "Restarting App Manager..."
	echo ""

	check_installation

	pm2 restart $APPNAME
}

stop_app() { 
	echo "Stopping App Manager..."
	echo ""

	if [ "$(pm2 list 2> /dev/null | grep $APPNAME | grep -o online)" = "online" ]; then
		pm2 stop $APPNAME
	else
		pm2 list
	fi
}

app_install() {
	script_install
	npm install

	# If config.json does not exist, create it
	if [ ! -f "$APPPATH"/"$INSTALLERFOLDER"/config.json ]; then
		configure_telegram
		clear
    fi

	start_app
	script_refresh
}

script_install() {
	# Save config files
	if [ -f "$APPPATH"/"$INSTALLERFOLDER"/config.json ]; then
		if [ ! -d /tmp ]; then
			mkdir /tmp
		fi
		cp -a "$APPPATH"/"$INSTALLERFOLDER"/config.json /tmp/
    fi

	if [ -d "$APPPATH"/"$INSTALLERFOLDER"/.git ]; then
	# If local repository exists check for updates		
		cd "$APPPATH"/"$INSTALLERFOLDER"
			git pull --ff-only origin master
	else
		git clone "$APPSCRIPTREPOSITORY" "$APPPATH"/"$INSTALLERFOLDER"
	fi

	# Recover config files
	if [ -f /tmp/config.json ]; then
		cp -a /tmp/config.json "$APPPATH"/"$INSTALLERFOLDER"/config.json
		rm -r /tmp
    fi

	check_bashrc_shortcuts
}

check_new_install() {
	if [ -f /tmp/install-server.sh ]; then
		rm -r /tmp/install-server.sh
		script_install
		script_refresh
	fi
}

script_update() {
	script_install
	script_refresh
}

script_refresh() {
	echo ""
    echo "Reloading script..."

	# Allow any pending output or processes to complete
    sleep 1

	# Retrieve all current process IDs
 #   pids=($(pgrep -f "install-server.sh"))

    # Restart script
#    bash "$APPPATH/$INSTALLERFOLDER/install-server.sh"
	sudo ./$(basename $0) && exit

    # Kill each of the old processes
#    for pid in "${pids[@]}"; do
#		kill -9 "$pid"
#    done
}

reload_shell() {
	cd
	exec bash
}

press_enter() {
	echo ""
  	echo -n "  Press Enter to continue "
  	read
  	clear
}

configure_telegram() {
	clear

	cd "$APPPATH"/"$INSTALLERFOLDER"

	username=""
	token=""

	if [ -f "$APPPATH"/"$INSTALLERFOLDER"/config.json ]; then
		username=$(jq .telegramUsername config.json | tr -d '"')
		token=$(jq .telegramToken config.json | tr -d '"')
	else
		echo ""
		echo "  Create a new Telegram bot, dedicated for this application, and enter its details below"
		echo ""
    fi

	echo ""
	echo -n "  > Enter Telegram username: $username"
	read new_username

	echo ""
	echo -n "  > Enter Telegram token: $token"
	read new_token

	[ -n "$new_username" ] && username=$new_username
	[ -n "$new_token" ] && token=$new_token

	echo "{\"telegramUsername\":\"${username}\",\"telegramToken\":\"${token}\"}" > config.json
}

server_install() { 
	pm2 delete all

	# Install packages
	echo "### Installing packages ###"
	apt -y update
	apt -y install git
	apt -y install -y nodejs
	apt -y install npm
	npm install pm2@latest -g
	apt -y update

	# Set maximum pm2 log file size and number of rotate files
	pm2 install pm2-logrotate
	pm2 set pm2-logrotate:max_size 10M
	pm2 set pm2-logrotate:retain 2
	
	# Create PM2 startup
	pm2 startup
}

incorrect_selection() {
  	echo "Incorrect selection! Try again."
}

if [[ $EUID -ne 0 ]]; then
   	echo "This script must be run as root"
   	exit 1
fi

check_new_install

until [ "$selection" = "0" ]; do
	clear
	echo "---------------------------------------------------------"
	echo ""
	echo "                    Installer v"$VERSION
	echo ""
	echo "---------------------------------------------------------"
	echo ""
	echo "      1  -  Install Server"
	echo "      2  -  Install App Manager"
	echo ""
	echo "      s  -  Start App Manager"
	echo "      t  -  Stop App Manager"
	echo "      r  -  Re-start App Manager"
	echo "" 
	echo "      c  -  Change Telegram settings"
	echo "      u  -  Update Installer & App Manager"
	echo ""
	echo "      0  -  Exit"
	echo ""
	echo "---------------------------------------------------------"
	echo "" 
	echo -n "  Enter selection: "
	read selection
	echo ""
	case $selection in
		1 ) clear ; server_install; press_enter ;;
		2 ) clear ; app_install; press_enter ;;
		s ) clear ; start_app ; press_enter ;;
		t ) clear ; stop_app ; press_enter ;;
		r ) clear ; restart_app ; press_enter ;;
		c ) clear ; configure_telegram ;;
		u ) clear ; script_update; press_enter ;;
		0 ) clear ; pkill -f "install-server.sh" ;;
		* ) clear ; incorrect_selection ; press_enter ;;
	esac
done