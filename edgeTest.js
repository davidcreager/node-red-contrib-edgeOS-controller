const EdgeOSServer = require("./edgeOSServer_new.js");
const serv = new EdgeOSServer({username:'david', password:'Polgara2',refreshPeriod:30});
let devices = {};
serv.init()
	.then((devs) => {
			console.log("[edgeOSNode] PID is " + serv.pid + " this pid is " + process.pid);
			devices = serv.refreshHostNames();
		})
	.catch( er => {
		console.log("[edgeTest][init] Error Caught " + er);
	} );
serv.on("devices", (data) => {
	//node.warn("Received ",data);
	console.log("[edgeOSNode][onDevices] " + JSON.stringify(data));
});
(async () => {
	let iters = 0;
	const awaitTimeout = delay => new Promise(resolve => setTimeout(resolve, delay));
	console.log( "Starting \t\t" + Object.keys(devices).length + " Devices returned ")
	while (iters < 120 ) {
		iters++;
		console.log("Waiting 30 secs");
		await awaitTimeout(30000);
		console.log("Refreshing");
		devices = await serv.refreshHostNames();
		console.log( "Refereshed iter " + iters + " \t" + Object.keys(devices).length + " Devices returned ")
	}
})()
	