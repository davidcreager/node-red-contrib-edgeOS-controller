module.exports = function(RED) {
    RED.nodes.registerType("edgeOS-controller",edgeOSController);
	let debugMsg = "";
	function edgeOSController(config) {
		const EdgeOS = require("./edgeOSServer.js");
		RED.nodes.createNode(this,config);
		this.devices = {};
        var node = this;
		node.status({fill: "blue", shape: "dot", text: "Ready "});
		this.connect = async function ( ip, user, password ) {
			if (this.edgeOSServer) {
				await this.edgeOSServer.close();
				this.edgeOSServer = null;
			}
			this.edgeOSServer = new EdgeOS({username: user, password: password, 		refreshPeriod:30});
			this.edgeOSServer.on("devices", (data) => { node.send({topic: "edgeOS/onDevices", payload: data}) });
			this.edgeOSServer.on("error", (err) => { node.error("[" + node.name + "][edgeOSServer][onError] Error Caught" + er) });
			this.devices = {};
			try {
				const tmp = await this.edgeOSServer.init();
				this.devices = Object.values(tmp).reduce( (devs, ent ) => {
						devs[ent.mac] = { status: "Loaded", seenDate: (new Date()), eventType: "connected", eventDate: (new Date()), ...ent };
						return devs;
					}, {} );
				this.connected = true;
			} catch (er) {
				debugMsg = "[connect] Error Caught " + er
				node.error("[" + node.name + "]" + debugMsg);
				node.status({fill: "red", shape: "ring", text: debugMsg});
				return null;
			}
			node.status({fill: "green", shape: "dot", text: "Connected " + Object.keys(this.devices).length + " devices"});
			return true;
		}
		this.edgeOSServer = null;
		node.on('input', async function(msg) {
			const validCommands = ["connect", "disconnect", "refreshHostNames", "listDevices"];
			if ( ( typeof(msg.payload) != "object"  || !msg.payload.hasOwnProperty("cmd")  || !validCommands.includes(msg.payload.cmd) ) && !validCommands.includes(msg.payload) ) {
				debugMsg = "[onInput][init] Invalid Payload " + msg.payload
				node.error(["[" + node.name + "]" + debugMsg + " should be " + validCommands.join("|"), msg ] );
				node.status({fill: "red", shape: "ring", text: debugMsg});
				return null;
			}
			const cmd = (typeof(msg.payload) == "object") ? msg.payload.cmd : msg.payload;
			if ( cmd == "connect" ) {
				if (!msg.password || !msg.user || !msg.ip) {
					debugMsg = "[onInput][" + cmd + "]" + " requires msg.password, msg.user and msg.baseURL to be set"
					node.error(["[" + node.name + "]" + debugMsg, msg ] );
					node.status({fill: "red", shape: "ring", text: debugMsg});
					return null;
				}
				const connectResult = await this.connect(msg.ip, msg.user, msg.password);
				if (connectResult) node.send( { topic: "edgeOsController/" + cmd, payload: Object.values(this.devices) } )
			} else if ( cmd == "refreshHostNames" || cmd == "listDevices" ) {
				if (!this.connected) {
					if (!msg.password || !msg.user || !msg.ip) {
						debugMsg = "[onInput][" + cmd + "]" + " Not connected";
						node.error(["[" + node.name + "]" + debugMsg, msg ] );
						node.status({fill: "red", shape: "ring", text: debugMsg});
						return null;
					}
					node.warn("[edgeOSController][" + cmd +"] Not connected - will attempt to connect")
					const connectedResult = await this.connect(msg.ip, msg.user, msg.password);
					if (!this.connected || !connectedResult) {
						debugMsg = "[" + cmd + "]" + " Not connected";
						node.error(["[" + node.name + "]" + debugMsg, msg ] );
						node.status({fill: "red", shape: "ring", text: debugMsg});
						return null;
					}
				}
				try {
					//devs[ent.mac] = { status: "Loaded", seenDate: (new Date()), eventType: "Connected", eventDate: (new Date()), ...ent };
					const newDevices = await this.edgeOSServer[cmd]();
					this.devices = Object.keys(this.devices).reduce( (devs, key ) => {
						devs[key].eventDate = (new Date());
						devs[key].changed = false;
						if (!newDevices[key] && devs[key].eventType != "Dropped") {
							devs[key].eventType = "Dropped";
							devs[key].status = "Dropped";
							devs[key].changed = true;
						} else if (newDevices[key]) {
							devs[key].eventType = "Refreshed";
							if (newDevices[key].ip != devs[key].ip) {
								devs[key].eventType = "IP Changed";
								devs[key].ip = newDevices[key].ip;
								devs[key].changed = true;
							}
							if (newDevices[key].hostname != devs[key].hostname){
								devs[key].eventType = "Hostname Changed";
								devs[key].hostname = newDevices[key].hostname;	
								devs[key].changed = true;
							}
						}
						return devs;
					}, this.devices );
					this.devices = Object.keys(newDevices).reduce( (devs, key ) => {
						if (!devs[key]) {
							devs[key] = newDevices[key];
							devs[key].status = "Added";
							devs[key].seenDate = (new Date());
							devs[key].eventType = "New";
							devs[key].eventDate = (new Date());
							devs[key].changed = true;
						}
						return devs;
					}, this.devices );
				} catch (er) {
					debugMsg = "[" + cmd + "]" + " Error caught " + er;
					node.error(["[" + node.name + "]" + debugMsg, msg ] );
					node.status({fill: "red", shape: "ring", text: debugMsg});
					return null
				}
				const changedDevices = Object.values(this.devices).filter( ent => (ent.changed) ) 
				if (changedDevices.length > 0) node.send( { topic: "edgeOsController/" + cmd, payload: changedDevices } );
				node.status({fill: "green", shape: "dot", text: cmd + " - " + changedDevices.length + " changed in " + Object.keys(this.devices).length + " devices"});
			} else if ( cmd == "disconnect" ) {
				if (!this.edgeOSServer) {
					debugMsg = "[onInput][" + cmd + "]" + " Not connected";
					node.error(["[" + node.name + "]" + debugMsg, msg ] );
					node.status({fill: "red", shape: "ring", text: debugMsg});
					return null
				}
				await this.edgeOSServer.close();
				this.connected = false;
				this.edgeOSServer = null;
				node.status({fill: "yellow", shape: "dot", text: "Closed"});
			}

        });
		node.on('close', async function(removed, done) {
			if (this.edgeOSServer) {
				node.warn("[" + node.name + "][onClose] Closing EdgeOSServer");
				try { await this.edgeOSServer.close() } catch (er) { node.error("[" + node.name + "][onClose] Error Caught" + er) }
			} else {
					node.warn("[" + node.name + "][onClose]" + "EdgeOSServer does not exist so no need to close")
			}
			done();
		});
    }
}