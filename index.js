const Discord = require("discord.js");
const Gamedig = require("gamedig");
const fetch = require("node-fetch");

const config = require("./config.json");
const db = require("./db.js");

const { Intents } = Discord;

const bot = new Discord.Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.DIRECT_MESSAGE_REACTIONS],
	partials: ["CHANNEL", "MESSAGE", "REACTION", "USER"]
});
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {};

let frumpyAvatarLink;

let allowedDevs = ["134088598684303360", "204729465564037120"];
let logChannel;

const prefix = config.prefix;

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

async function intervalFunction() {
	// console.time("all")

	await refresh(serverObject);
	let embed = await makeEmbed();

	config.embeds.forEach(async (e) => {
		let channel = await bot.channels.fetch(e.channelID);
		let message = await channel.messages.fetch(e.messageID);
		message.edit({ content: "‎", embeds: [embed] });
	});

	// console.timeEnd("all")
}

async function refresh(servers) {
	//refreshes all servers

	let allData = {};

	let index = 1;

	for (let s in servers) {
		//loops thru servers
		allData[s] = await getInfo(servers[s], index); //gets info from server
		index++;
	}

	gData = allData; //overwrites Global data var
}

async function getInfo(server, index) {
	// Get IP and port from the server object
	const [ip, port] = server.ip.split(":");

	let valid = true;

	// Query the server using Gamedig
	const res = await Gamedig.query({
		type: "csgo",
		host: ip,
		port: port,
		maxAttempts: 4
	}).catch((e) => {
		valid = false;
	});

	let data;

	if (valid) {
		// If the server is valid, populate the data object with server information
		data = {
			online: true,
			name: server.nick, // Short nickname
			fullIP: res.connect, // String with ip:port
			map: res.map, // Current map
			maxPlayers: res.maxplayers,
			players: res.players, // Players array {name, score, time}
			bots: res.bots, // Bots array {name, score, time}
			numPlayers: res.raw.numplayers - res.raw.numbots, // int
			numBots: res.raw.numbots, // int
			show: server.show, // bool to print server in embed
			keywords: server.keywords, // array of keywords for --players command
			index: index
		};
	} else {
		// If the server is not valid, populate the data object with minimal information
		data = {
			online: false,
			name: server.nick,
			keywords: server.keywords,
			index: index
		};
	}

	return data;
}

function makeEmbed() {
	// Create a new Discord embed with the title and other details
	const embed = new Discord.MessageEmbed()
		.setTitle("Server List")
		.setDescription("This list is updated every 1.5 minutes.")
		.setColor(7980240)
		.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
		.setTimestamp(Date.now());

	// Iterate through the servers in gData and add server details to the embed
	for (const server of Object.values(gData)) {
		if (!server.online) {
			// If the server is offline, add a field indicating it's not available
			embed.addFields({
				name: server.name,
				value: "**Server is not available.**",
				inline: true
			});
			continue;
		}

		if (!server.show) continue; // Skip servers that shouldn't be displayed

		// Add a field for the online server with player, map, and IP details
		embed.addFields({
			name: server.name,
			value: `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}\n**__Map:__** ${getWebsite(server.map)}\n**__IP:__** ${
				server.fullIP
			}`,
			inline: true
		});
	}

	return embed;
}

bot.on("ready", async () => {
	console.log("Started as " + bot.user.tag);
	bot.user.setActivity("--follow <map> in #bot-commands");
	let frumpy = await bot.users.fetch("134088598684303360");
	frumpyAvatarLink = frumpy.avatarURL() || "https://i.imgur.com/cBiDnMi.png";
	logChannel = bot.guilds.cache.get(config.logging.guildID).channels.cache.get(config.logging.channelID);

	intervalFunction();

	setInterval(intervalFunction, config.intervalMS); //starts embed update loop
});

function getWebsite(mapName) {
	// Determine the appropriate website URL based on the map prefix

	// Check if the map is a surf map
	if (mapName.startsWith("surf_")) {
		return `[${mapName}](https://snksrv.com/surfstats/?view=map&name=${mapName})`;
	}

	// Check if the map is a kz map
	const kzPrefixes = ["bkz_", "kz_", "kzpro_", "skz_", "vnl_", "xc_"];
	if (kzPrefixes.some((prefix) => mapName.startsWith(prefix))) {
		return `[${mapName}](https://snksrv.com/kzstats/#/maps/${mapName}/)`;
	}

	// Check if the map is a bhop map
	if (mapName.startsWith("bhop")) {
		return `[${mapName}](https://snksrv.com/bhopstats/index.php?map=${mapName})`;
	}

	// Return the map name if no matching prefix is found
	return mapName;
}

function isEmpty(obj) {
	//checks if bot has started//if empty bot is starting
	for (var key in obj) {
		if (obj.hasOwnProperty(key)) return false;
	}
	return true;
}

function keywordToServer(keyword) {
	//takes keywords and returns server obj
	for (let s in gData) {
		let server = gData[s];

		if (server.keywords.includes(keyword) || server.index == keyword) {
			return gData[s];
		}
	}
	return false;
}

function playerListEmbed(server) {
	let embed;

	if (server.online) {
		// Create an embed for the online server
		embed = new Discord.MessageEmbed()
			.setTitle(
				`${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${server.name} on ${server.map}`.replace(/\_/g, "\\_")
			)
			.setColor(7980240)
			.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
			.setTimestamp(Date.now());

		// Generate a list of player names
		let list = server.players.map((player) => player.name).join("\n");
		let botList = server.bots.map((bot) => bot.name).join("\n");
		list += botList;

		// Escape special characters for Discord and remove connecting players
		list = list
			.replace(/\`/g, "'")
			.replace(/\*/g, "\\*")
			.replace(/\_/g, "\\_")
			.replace(/undefined\n/g, "");

		embed.setDescription(list);
	} else {
		// Create an embed for the offline server
		embed = new Discord.MessageEmbed()
			.setTitle(`${server.name} is currently unavailable.`)
			.setColor(7980240)
			.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
			.setTimestamp(Date.now())
			.setImage("https://i.imgur.com/WnS0Biz.png");
	}

	return embed;
}

function makeServerList() {
	// Create a server list embed for public commands
	let embed = new Discord.MessageEmbed()
		.setTitle("Please specify what server you want to check.")
		.setColor(7980240)
		.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
		.setTimestamp(Date.now());

	// Generate the server list
	let list = Object.values(gData)
		.map((server) => {
			if (server.online) {
				return `${server.index}: **__${server.name}__**: ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} on ${getWebsite(server.map)}`;
			} else {
				return `${server.index}: **__${server.name}__**: is currently unavailable.`;
			}
		})
		.join("\n");

	embed.setDescription(list);

	return embed;
}

// Returns the map image URL for the given map name
function getMapImage(mapName) {
	if (mapName.startsWith("surf_") || mapName.startsWith("bhop_")) {
		return `https://bans.snksrv.com/images/maps/${mapName}.jpg`;
	} else if (["bkz_", "kz_", "kzpro_", "skz_", "vnl_", "xc_"].some((prefix) => mapName.startsWith(prefix))) {
		return `https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/${mapName}.jpg`;
	} else {
		return false;
	}
}

// Returns the stats page URL for the given map name
function getStatsPage(mapName) {
	if (mapName.startsWith("surf_")) {
		return `https://snksrv.com/surfstats/?view=map&name=${mapName}`;
	} else if (["bkz_", "kz_", "kzpro_", "skz_", "vnl_", "xc_"].some((prefix) => mapName.startsWith(prefix))) {
		return `https://snksrv.com/kzstats/#/maps/${mapName}/`;
	} else if (mapName.startsWith("bhop")) {
		return `https://snksrv.com/bhopstats/index.php?map=${mapName}`;
	} else {
		return false;
	}
}

// Creates a map embed with optional server information
function makeMapEmbed(mapName, server) {
	// Get the map image and stats page URLs
	const image = getMapImage(mapName);
	const stats = getStatsPage(mapName);

	// Create a new Discord MessageEmbed instance
	const embed = new Discord.MessageEmbed().setColor(7980240).setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink }).setTimestamp(Date.now());

	// Set the embed URL if a stats page is available
	if (stats) {
		embed.setURL(stats);
	}

	// Set the embed image if an image is available
	if (image) {
		embed.setImage(image);
	}

	// Set the embed title based on whether a server is provided
	if (server) {
		embed.setTitle(`${server.name} is currently on ${mapName}`.replace(/\_/g, "\\_"));
	} else {
		embed.setTitle(`${mapName} stats`.replace(/\_/g, "\\_"));
	}

	return embed;
}

async function addTrash(msg, om) {
	//react a trash can and if the member reacts it delete the message
	await msg.react("🗑️").then((reaction) => {
		const filter = (reaction, user) => reaction.emoji.name === "🗑️" && user.id === om.author.id;
		const collector = msg.createReactionCollector({
			filter,
			time: 30000,
			max: 1
		}); //60000
		collector.on("collect", (r) => {
			msg.delete();
			if(msg.channel.type !== "DM") om.delete().catch((e) => {
				//trihard
			});
			collector.stop();
		});
		collector.on("end", () => {
			if (collector.endReason !== "limit") {
				reaction.remove().catch((e) => {
					//trihard
				});
			} else {
				return;
			}
		});
	});
}

bot.on("messageCreate", async (message) => {
	//public commands

	const args = message.content.slice(message.content.startsWith(prefix) ? prefix.length : 0).split(/ +/);
	const command = args.shift().toLowerCase();

	if (!message.content.startsWith(prefix) && !message.content.startsWith("—")) return;
	if (message.author.bot) return;

	if (command == "players" || command == "p") {
		// Check if gData is empty
		if (isEmpty(gData)) {
			return message.channel.send("Please Wait. The bot is starting.");
		}

		// If no arguments are provided, send the server list embed
		if (args.length == 0) {
			return message.channel.send({ embeds: [await makeServerList()] }).then((msg) => addTrash(msg, message));
		}

		// Easter egg for "frumpy" argument
		if (args[0].toLowerCase() == "frumpy") {
			message.delete();
			const egg = new Discord.MessageEmbed()
				.setTitle("listen here")
				.setURL("https://www.youtube.com/watch?v=lPGipwoJiOM")
				.setColor("#26bf7a")
				.setDescription(require("fs").readFileSync("./meme.txt").toString())
				.setFooter({ text: "ｆｒｕｍｐｙ７", iconURL: frumpyAvatarLink })
				.setTimestamp(Date.parse("Sat Mar 15 4207 04:20:07 GMT-0456"))
				.setImage("https://i.imgur.com/FHTK2WB.gif")
				.setAuthor({
					name: "( ͡° ͜ʖ ͡°)",
					iconURL: "https://media.discordapp.net/attachments/717611782813909083/724409223911440424/borger.jpg?width=676&height=676",
					url: "https://mrdoob.com/#/157/spin_painter"
				});

			return message.channel.send({ embeds: [egg] });
		}

		// Search for the server using the provided keyword(s)
		const server = await keywordToServer(args.join(" ").toLowerCase());

		// If a valid server is found, send the player list embed
		if (!server) {
			return message.channel.send("Please enter a valid server.");
		} else {
			const embed = await playerListEmbed(server);
			message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
		}
	} else if (command == "map" || command == "m") {
		// Check if gData is empty
		if (isEmpty(gData)) {
			return message.channel.send("Please Wait. The bot is starting.");
		}

		// If no arguments are provided, send the server list embed
		if (args.length == 0) {
			return message.channel.send({ embeds: [await makeServerList()] }).then((msg) => addTrash(msg, message));
		}

		// Search for the server using the provided keyword(s)
		const server = await keywordToServer(args.join(" ").toLowerCase());

		if (!server) {
			// If no valid server is found, try searching for a map image
			const isMap = getMapImage(args[0]);
			let res;

			if (isMap) {
				res = await fetch(isMap, { method: "HEAD" });
			}

			// If no valid map image is found, return an error message
			if (!isMap || !res.ok) {
				return message.channel.send("Please choose a valid server/map.");
			}

			// If a valid map image is found, create and send the map embed
			const embed = makeMapEmbed(args[0]);
			message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
		} else {
			let embed;

			// If a valid server is found, create and send the map embed
			if (server.online) {
				embed = makeMapEmbed(server.map, server);
			} else {
				embed = new Discord.MessageEmbed()
					.setTitle(`${server.name} is currently unavailable.`)
					.setColor(7980240)
					.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
					.setTimestamp(Date.now())
					.setImage("https://i.imgur.com/WnS0Biz.png");
			}

			message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
		}
	} else if (command == "help" || command == "commands") {
		let embed = new Discord.MessageEmbed().setTitle(`List of commands`).setColor(7980240).setTimestamp(Date.now()).addFields(
			{
				name: "--players/--p",
				value: "`--players <Server>`\nThis command will return a list of currently connected users to the specified server."
			},
			{
				name: "--map/--m",
				value: "`--map <Server/Map>`\nThis command return with what map a server is on, along with any other relevant information about the map."
			},
			{
				name: "--keywords/--keys",
				value: "`--keywords`\nThis command will show you a list of keywords you can use with the bot."
			},
			{
				name: "--follow/--f",
				value: "`--follow <Map>`\nThis command will DM you whenever a map you follow is on a server."
			},
			{
				name: "--unfollow/--uf",
				value: "`--unfollow <Map>/all`\nThis command will stop you from being DM'd whenever a map you follow is on a server."
			},
			{
				name: "--listfollows/--lf",
				value: "`--listfollows`\nThis command will return a list of all maps you are following."
			}
		);

		message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
	} else if (command == "keywords" || command == "keys") {
		let list = "";

		for (let i in serverObject) {
			let server = serverObject[i];
			list += "**" + server.nick + ":**\n";
			for (let k of server.keywords) {
				list += "\t" + k;
			}
			list += "\n";
		}

		message.channel.send(list).then((msg) => addTrash(msg, message));
	} else if (command == "ping") {
		message.react("🏓");
	} else if (command == "v" || command == "version") {
		message.channel.send(require("./package.json").version);
	} else if (command == "follow" || command == "f") {
		const map = args.join(" ").toLowerCase();

		// Check if no map or a mention is given, and return an error message if true
		if (
			!map ||
			map.match(Discord.MessageMentions.USERS_PATTERN) ||
			map.match(Discord.MessageMentions.ROLES_PATTERN) ||
			map.match(Discord.MessageMentions.EVERYONE_PATTERN)
		) {
			return message.channel.send("Please enter a valid map name.");
		}

		// Check if the user is already following the map, and return a message if true
		if (await db.isFollowingMap(message.author.id, map)) {
			return message.channel.send("You are already following this map.");
		}

		// Follow the map
		db.followMap(message.author.id, map);

		// Send a confirmation message and add a reaction for the user to undo the follow action
		message.channel.send("You are now following " + map + ". You will be notified when the map comes on a server.").then(async (msg) => {
			// Add a reaction for the user to undo the follow action
			await msg.react("↩️").then((reaction) => {
				const filter = (reaction, user) => reaction.emoji.name === "↩️" && user.id === message.author.id;
				const collector = msg.createReactionCollector({
					filter,
					time: 30000,
					max: 1
				});
				collector.on("collect", (r) => {
					db.unfollowMap(message.author.id, map);
					msg.delete();
					message.delete();
					message.channel.send("You are no longer following " + map + ".");
					collector.stop();
				});
				collector.on("end", () => {
					if (collector.endReason !== "limit") {
						reaction.remove().catch((e) => {});
					} else {
						return;
					}
				});
			});
		});

		console.log(message.author.tag + " followed map " + map);

		// Log the map follow action in the log channel
		const logEmbed = new Discord.MessageEmbed()
			.setTitle("User Followed Map")
			.setColor(7980240)
			.setTimestamp(Date.now())
			.addFields({ name: "User", value: message.author.toString() }, { name: "Map", value: map })
			.setThumbnail(message.author.displayAvatarURL())
			.setAuthor({
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			});

		logChannel.send({ embeds: [logEmbed] });
	} else if (command == "unfollow" || command == "uf") {
		const map = args.join(" ").toLowerCase();

		// Check if no map or a mention is given, and return an error message if true
		if (
			!map ||
			map.match(Discord.MessageMentions.USERS_PATTERN) ||
			map.match(Discord.MessageMentions.ROLES_PATTERN) ||
			map.match(Discord.MessageMentions.EVERYONE_PATTERN)
		) {
			return message.channel.send("Please enter a valid map name.");
		}

		// If the argument is "all", unfollow all maps
		if (map == "all") {
			db.unfollowAll(message.author.id);
			message.channel.send("You are no longer following any maps.");
			console.log(message.author.tag + " unfollowed all maps");
		} else {
			// If the user is not following the map, return an error message
			if (!(await db.isFollowingMap(message.author.id, map))) {
				return message.channel.send("You are not following this map. Use `" + prefix + "listfollows` to see a list of maps you are following.");
			}

			// Unfollow the map
			db.unfollowMap(message.author.id, map);
			message.channel.send("You are no longer following " + map + ".");
			console.log(message.author.tag + " unfollowed map " + map);
		}

		// Log the map unfollow action in the log channel
		const logEmbed = new Discord.MessageEmbed()
			.setTitle("User Unfollowed Map")
			.setColor(7980240)
			.setTimestamp(Date.now())
			.addFields({ name: "User", value: message.author.toString() }, { name: "Map", value: map })
			.setThumbnail(message.author.displayAvatarURL())
			.setAuthor({
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			});

		logChannel.send({ embeds: [logEmbed] });
	} else if (command == "listfollows" || command == "lf") {
		//list all users follows
		let follows = await db.getUserFollows(message.author.id);
		// console.log(follows)
		if (follows.length == 0) return message.channel.send("You are not following any maps.");
		let list = "";
		for (let i in follows) {
			let stats = getStatsPage(follows[i].map_name);
			if (stats) {
				list += `[${follows[i].map_name}](${stats})` + "\n";
			} else {
				list += follows[i].map_name + "\n";
			}
		}
		let embed = new Discord.MessageEmbed().setTitle(`List of maps you are following:`).setColor(7980240).setTimestamp(Date.now()).setDescription(list);
		message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
	}
});

bot.on("messageCreate", async (message) => {
	//dev commands

	if (!allowedDevs.includes(message.author.id)) return; //if not frumpy or sneak no commands will run

	const args = message.content.slice(prefix.length).split(/ +/);
	const command = args.shift().toLowerCase();
	if (!message.content.startsWith(prefix)) return;
	if (message.author.bot) return;

	if (command == "id") {
		message.channel.send("does sneak gay?").then((m) => {
			m.edit(m.id);
		});
	} else if (command == "mem") {
		let used = process.memoryUsage();
		let out = "```";
		for (let key in used) {
			out += `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB\n`;
		}
		out += "```";

		message.channel.send(out);
	} else if (command == "check") {
		let ip = args[0];

		if (!args[0]) return message.channel.send("Please enter an ip.");

		let embed = await checkIP(ip);

		if (!embed) return message.channel.send("The server is unavailable.");

		message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
	} else if (command == "listallfollows" || command == "laf") {
		// Retrieve all followed maps from the database
		const follows = await db.getAllFollows();

		// Sort follows by discord ID
		follows.sort((a, b) => {
			if (a.discord_id < b.discord_id) return -1;
			if (a.discord_id > b.discord_id) return 1;
			return 0;
		});

		// If there are no users following any maps, return an error message
		if (!follows) {
			return message.channel.send("There are no users following any maps.");
		}

		// Create a list of all followed maps
		let list = "";
		for (const follow of follows) {
			const stats = getStatsPage(follow.map_name);

			if (stats) {
				list += `<@${follow.discord_id}>: [${follow.map_name}](${stats})\n`;
			} else {
				list += `<@${follow.discord_id}>: ${follow.map_name}\n`;
			}
		}

		// Create an embed with the list of followed maps
		const embed = new Discord.MessageEmbed().setTitle("List of all followed maps:").setColor(7980240).setTimestamp(Date.now()).setDescription(list);

		// Send the embed and add a trash reaction to it
		message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
	} else if (command == "testnotify") {
		let map = args.join(" ").toLowerCase();
		if (!map) return message.channel.send("Please enter a valid map name.");
		//if the map isnt in the database
		if (!db.hasMap(map)) return message.channel.send("No one is following this map.");
		//react a thumbs up to the message

		notifyUsers(map);
	} else if (command == "removeuser") {
		let userID = args[0];
		if (!userID) return message.channel.send("Please enter a valid user ID.");
		db.unfollowAll(userID);
		message.channel.send("Removed all maps from user <@" + userID + ">.");
	}
});

async function checkIP(ip) {
	// Extract port from the IP address, if available
	let port = "27015";
	if (ip.includes(":")) {
		[ip, port] = ip.split(":");
	}

	// Create a server object with the necessary information for getInfo()
	const server = {
		ip: `${ip}:${port}`,
		nick: "Custom Server",
		show: true,
		keywords: []
	};

	// Get server info using getInfo()
	const serverInfo = await getInfo(server);

	if (!serverInfo.online) return false;

	// Get the map image
	const image = getMapImage(serverInfo.map);

	// Create the embed with the server data
	const embed = new Discord.MessageEmbed()
		.setTitle(
			`${serverInfo.numPlayers} (${serverInfo.numBots}) / ${serverInfo.maxPlayers} players connected to ${serverInfo.name} on ${serverInfo.map}`.replace(
				/_/g,
				"\\_"
			)
		)
		.setColor(7980240)
		.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
		.setTimestamp(Date.now());
	if (image) embed.setImage(image);

	// Create a list of players and bots
	let list = "";
	for (const player of serverInfo.players) {
		list += `${player.name}\n`;
	}
	for (const bot of serverInfo.bots) {
		list += `${bot.name}\n`;
	}

	// Sanitize the list for Discord and remove undefined entries
	list = list
		.replace(/`/g, "'")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/undefined\n/g, "");

	// Set the list as the embed description
	embed.setDescription(list);

	return embed;
}

const notifyUsers = async (map, serverObj) => {
	const server = serverObj ? serverObj.nick : "unknown server";
	const ip = serverObj ? serverObj.ip : "unknown IP";
	const users = await db.getUsersFollowingMap(map);

	for (const user of users) {
		try {
			const u = await bot.users.fetch(user.discord_id);

			// Prepare the embed for the direct message
			const dmEmbed = new Discord.MessageEmbed()
				.setTitle(`${map} is now on ${server}`)
				.setDescription(
					`**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
				)
				.setColor(7980240)
				.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
				.setTimestamp(Date.now());

			const stats = getStatsPage(map);
			if (stats) dmEmbed.setURL(stats);

			const mapImage = getMapImage(map);
			if (mapImage) dmEmbed.setImage(mapImage);

			// Send the direct message to the user
			await u.send({
				embeds: [dmEmbed],
				content: `${map} is now on ${server}!\nsteam://connect/${ip}`
			});

			// Log the successful notification
			const logEmbed = new Discord.MessageEmbed()
				.setTitle(`Notification has been sent.`)
				.setColor(7980240)
				.setTimestamp(Date.now())
				.setDescription(`${u} was sent a notification for ${map} on ${server}!`)
				.setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
				.setThumbnail(u.displayAvatarURL());

			logChannel.send({ embeds: [logEmbed] });
			console.log(`Sent notification to ${u.tag} about ${map}`);
		} catch (e) {
			// Handle failed notifications
			const backupEmbed = new Discord.MessageEmbed()
				.setTitle(`${map} is now on ${server}`)
				.setDescription(
					`**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
				)
				.setColor(7980240)
				.setFooter({ text: "Last Updated", iconURL: frumpyAvatarLink })
				.setTimestamp(Date.now());

			if (stats) backupEmbed.setURL(stats);
			if (mapImage) backupEmbed.setImage(mapImage);

			bot.guilds.cache
				.get("253812864786235402")
				.channels.cache.get("269171320732778496")
				.send({
					embeds: [backupEmbed],
					content: `${u}\n${map} is now on ${server}!\nsteam://connect/${ip}`
				});
		}
	}
};

// Initialize oldData with server keys from serverObject and set values to 0
const oldData = {};
const serverObjectKeys = Object.keys(serverObject);

for (const server of serverObjectKeys) {
	oldData[server] = 0;
}

// Function to update server data and notify users if there's a change in the .map property
const updateServerData = async () => {
	const oldDataKeys = Object.keys(oldData);
	const gDataKeys = Object.keys(gData);

	for (let i = 0; i < oldDataKeys.length; i++) {
		const currentServer = oldDataKeys[i];
		let currentServerObject = serverObject[currentServer];

		if (oldData[currentServer] === 0) {
			oldData[currentServer] = gData[gDataKeys[i]].map;
		} else if (oldData[currentServer] !== gData[gDataKeys[i]].map) {
			const newMap = gData[gDataKeys[i]].map;

			currentServerObject["numPlayers"] = gData[gDataKeys[i]].numPlayers;
			currentServerObject["numBots"] = gData[gDataKeys[i]].numBots;
			currentServerObject["maxPlayers"] = gData[gDataKeys[i]].maxPlayers;

			notifyUsers(newMap, currentServerObject);
			oldData[currentServer] = newMap;
		}
	}
};

// Run the updateServerData function every 91 seconds (91000 milliseconds)
setInterval(updateServerData, 91000);

//if a member leaves delete all their follows in db
bot.on("guildMemberRemove", async (member) => {
	db.unfollowAll(member.id);
});
