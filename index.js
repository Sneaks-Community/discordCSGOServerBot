const Discord = require("discord.js");
const Gamedig = require("gamedig");
const fetch = require("node-fetch");


const config = require("./config.json")
const db = require("./db.js")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;

let allowedDevs = ["134088598684303360", "204729465564037120"];
let logChannel;

const prefix = config.prefix;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';


async function intervalFunction() {

    // console.time("all")

    await refresh(serverObject);
    let embed = await makeEmbed();

    config.embeds.forEach(async e => {

        let channel = await bot.channels.fetch(e.channelID);
        let message = await channel.messages.fetch(e.messageID)
        message.edit("‎", { embed: embed })

    })

    // console.timeEnd("all")

}

async function refresh(servers) {//refreshes all servers

    let allData = {}

    let index = 1;

    for (let s in servers) {//loops thru servers 
        allData[s] = await getInfo(servers[s], index)//gets info from server
        index++;
    }

    gData = allData;//overwrites Global data var
}

async function getInfo(server, index) {//gets info for 1 server at a time

    // console.time("server")

    let ip = server.ip.split(":")[0];
    let port = server.ip.split(":")[1];

    let valid = true;

    let res = await Gamedig.query({
        type: "csgo",
        host: ip,
        port: port,
        maxAttempts: 4
    }).catch(e => {
        valid = false;
    })

    let data;


    if (valid) {
        data = {
            online: true,
            name: server.nick,//Short nickname
            fullIP: res.connect,//String with ip:port
            map: res.map,//Current map
            maxPlayers: res.maxplayers,
            players: res.players,//Players array {name, score, time}
            bots: res.bots,//Bots array {name, score, time}
            numPlayers: res.raw.numplayers - res.raw.numbots,//int
            numBots: res.raw.numbots,//int
            show: server.show,//bool to print server in embed
            keywords: server.keywords,//array of keywords for --players command
            index: index
        }
    }
    else {
        data = {
            online: false,
            name: server.nick,
            keywords: server.keywords,
            index: index
        }
    }



    // console.timeEnd("server")

    return data;
}

function makeEmbed() {
    // console.time("embed")
    let embed = new Discord.MessageEmbed()
        .setTitle("Server List")
        .setDescription("This list is updated every 1.5 minutes.")
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())

    for (let s in gData) {//makes field for ever server 
        let server = gData[s];



        if (server.online) {

            if (!server.show) continue;

            embed.addField(
                server.name,
                `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}
                **__Map:__** ${getWebsite(server.map)}
                **__IP:__** ${server.fullIP}`,
                true
            )
        } else {//checks if offline
            embed.addField(
                server.name,
                "**Server is not available.**",
                true
            )
        }

    }
    // console.timeEnd("embed")
    return embed;
}

bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--follow <map> in #bot-commands");
    let frumpy = await bot.users.fetch("134088598684303360")
    frumpyAvatarLink = frumpy.avatarURL() || "https://i.imgur.com/cBiDnMi.png"
    logChannel = bot.guilds.cache.get(config.logging.guildID).channels.cache.get(config.logging.channelID)

    intervalFunction();

    bot.setInterval(intervalFunction, config.intervalMS)//starts embed update loop

})


function getWebsite(mapName) {//returns stats website if available 
    //https://snksrv.com/surfstats/?view=map&name=x
    //https://snksrv.com/kzstats/#/maps/x
    if (mapName.startsWith("surf_")) {
        return `[${mapName}](https://snksrv.com/surfstats/?view=map&name=${mapName})`
    } else if (mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")) {
        return `[${mapName}](https://snksrv.com/kzstats/#/maps/${mapName}/)`
    } else if (mapName.startsWith("bhop")) {
        return `[${mapName}](https://snksrv.com/bhopstats/index.php?map=${mapName})`
    } else {
        return mapName
    }

}

function isEmpty(obj) {//checks if bot has started//if empty bot is starting
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function keywordToServer(keyword) {//takes keywords and returns server obj
    for (let s in gData) {
        let server = gData[s];

        if (server.keywords.includes(keyword) || server.index == keyword) {
            return gData[s];
        }
    }
    return false;
}

function playerListEmbed(server) {//makes embed with list of players

    let embed;

    if (server.online) {
        embed = new Discord.MessageEmbed()
            .setTitle(`${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${server.name} on ${server.map}`.replace(/\_/g, "\\_"))
            .setColor(7980240)
            .setFooter("Last Updated", frumpyAvatarLink)
            .setTimestamp(Date.now())

        let list = "";

        for (let i in server.players) {
            let player = server.players[i];

            list += player.name + "\n"
        }

        for (let i in server.bots) {
            let bot = server.bots[i];

            list += bot.name += "\n";
        }

        list = list.replace(/\`/g, "'").replace(/\*/g, "\\*").replace(/\_/g, "\\_").replace(/undefined\n/g, "");//removes back ticks for discord, and removes connecting players... i think

        embed.setDescription(list);
    } else {//if offline
        embed = new Discord.MessageEmbed()
            .setTitle(`${server.name} is currently unavailable.`)
            .setColor(7980240)
            .setFooter("Last Updated", frumpyAvatarLink)
            .setTimestamp(Date.now())
            .setImage("https://i.imgur.com/WnS0Biz.png")
    }
    return embed;
}

function makeServerList() {//make server list embed for public commands
    let embed = new Discord.MessageEmbed()
        .setTitle("Please specify what sever you want to check.")
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())

    let list = "";

    for (let i in gData) {
        let server = gData[i];

        if (server.online) {
            list += `${server.index}: **__${server.name}__**: ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} on ${getWebsite(server.map)}\n`;
        } else {
            list += `${server.index}: **__${server.name}__**: is currently unavailable.\n`
        }

    }

    embed.setDescription(list)

    return embed;
}

function getMapImage(mapName) {//looks for map image
    if (mapName.startsWith("surf_") || mapName.startsWith("bhop_")) {
        return `https://snksrv.com/bans/images/maps/${mapName}.jpg`
    } else if (mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")) {
        return `https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/${mapName}.jpg`
    } else {
        return false;
    }
}

function getStatsPage(mapName) {//looks for stats page
    if (mapName.startsWith("surf_")) {
        return `https://snksrv.com/surfstats/?view=map&name=${mapName}`
    } else if (mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")) {
        return `https://snksrv.com/kzstats/#/maps/${mapName}/`
    } else if (mapName.startsWith("bhop")) {
        return `https://snksrv.com/bhopstats/index.php?map=${mapName}`
    } else {
        return false;
    }
}

function makeMapEmbed(mapName, server) {

    server = server || false;

    let image = getMapImage(mapName)
    let stats = getStatsPage(mapName)

    let embed = new Discord.MessageEmbed()
        //.setTitle(`${server.name} is currently on ${mapName}`.replace(/\_/g, "\\_"))
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())
    if (stats) embed.setURL(stats)
    if (image) embed.setImage(image)
    if (server) embed.setTitle(`${server.name} is currently on ${mapName}`.replace(/\_/g, "\\_"))
    if (!server) embed.setTitle(`${mapName} stats`.replace(/\_/g, "\\_"))

    return embed;

}

function addTrash(msg){
    //react a trash can and if the member reacts it delete the message
    msg.react("🗑️").then(reaction => {
        const filter = (reaction, user) => reaction.emoji.name === '🗑️' && user.id === message.author.id;
        const collector = msg.createReactionCollector(filter, { time: 30000 });//60000
        collector.on('collect', r => {
            msg.delete();
            message.delete();
        });
        collector.on("end", () => {
            reaction.remove();
        })
    });
}

bot.on('message', async message => {//public commands

    const args = message.content.slice(message.content.startsWith("—") ? 1 : prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix) && !message.content.startsWith("—")) return;
    if (message.author.bot) return;

    if (command == "players" || command == "p") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({ embed: await makeServerList() }).then(msg => addTrash(msg));
        }

        if (args[0].toLowerCase() == "frumpy") {//easteregg
            message.delete();
            let egg = new Discord.MessageEmbed()
                .setTitle(`listen here`)
                .setURL("https://www.youtube.com/watch?v=lPGipwoJiOM")
                .setColor("#26bf7a")
                .setDescription(require("fs").readFileSync("./meme.txt"))
                .setFooter("ｆｒｕｍｐｙ７", frumpyAvatarLink)
                .setTimestamp(Date.parse("Sat Mar 15 4207 04:20:07 GMT-0456"))
                .setImage("https://i.imgur.com/FHTK2WB.gif")
                .setAuthor("( ͡° ͜ʖ ͡°)", "https://media.discordapp.net/attachments/717611782813909083/724409223911440424/borger.jpg?width=676&height=676", "https://mrdoob.com/#/157/spin_painter")


            return message.channel.send({ embed: egg })
        }

        let server = await keywordToServer(args.join(" ").toLowerCase());

        if (!server) {
            return message.channel.send("Please enter a valid server.");
        } else {//if returns valid server obj
            let embed = await playerListEmbed(server);

            message.channel.send({ embed: embed }).then(msg => addTrash(msg));
        }


    }

    else if (command == "map" || command == "m") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({ embed: await makeServerList() }).then(msg => addTrash(msg));
        }

        let server = await keywordToServer(args.join(" ").toLowerCase());

        if (!server) {
            // return message.channel.send("Please choose a valid server.");
            let isMap = getMapImage(args[0])

            let res;

            if (isMap) {
                res = await fetch(isMap, { method: "HEAD" })
            }

            if (!isMap || !res.ok) return message.channel.send("Please choose a valid server/map.")

            let embed;
            embed = makeMapEmbed(args[0])
            message.channel.send({ embed: embed }).then(msg => addTrash(msg));

        } else {

            let embed;

            if (server.online) {

                embed = makeMapEmbed(server.map, server);

            } else {

                embed = new Discord.MessageEmbed()
                    .setTitle(`${server.name} is currently unavailable.`)
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                    .setImage("https://i.imgur.com/WnS0Biz.png")

            }

            message.channel.send({ embed: embed }).then(msg => addTrash(msg));

        }

    }

    else if (command == "help" || command == "commands") {
        let embed = new Discord.MessageEmbed()
            .setTitle(`List of commands`)
            .setColor(7980240)
            .setTimestamp(Date.now())
            .addField("--players/--p", "`--players <Server>`\nThis command will return a list of currently connected users to the specified server.")
            .addField("--map/--m", "`--map <Server/Map>`\nThis command return with what map a server is on, along with any other relevant information about the map.")
            .addField("--keywords/--keys", "`--help`\nThis command will show you a list of keywords you can use with the bot.")
            .addField("--follow/--f", "`--follow <Map>`\nThis command will DM you whenever a map you follow is on a server.")
            .addField("--unfollow/--uf", "`--unfollow <Map>/all`\nThis command will stop you from being DM'd whenever a map you follow is on a server.")
            .addField("--listfollows/--lf", "`--listfollows`\nThis command will return a list of all maps you are following.")

        message.channel.send({ embed: embed }).then(msg => addTrash(msg));
    }

    else if (command == "keywords" || command == "keys") {
        let list = "";

        for (let i in serverObject) {
            let server = serverObject[i];
            list += "**" + server.nick + ":**\n"
            for (let k of server.keywords) {
                list += "\t" + k;
            }
            list += "\n"
        }

        message.channel.send(list).then(msg => addTrash(msg));
    }

    else if (command == "ping") {
        message.react("🏓")
    }

    else if (command == "v" || command == "version") {
        message.channel.send(require("./package.json").version)
    }
    else if (command == "follow" || command == "f") {
        let map = args.join(" ").toLowerCase();
        //if no map or a mention is given return
        //discord id regex
        // console.log(map.match((Discord.MessageMentions.USERS_PATTERN)))
        if (!map || map.match(Discord.MessageMentions.USERS_PATTERN) || map.match(Discord.MessageMentions.ROLES_PATTERN) || map.match(Discord.MessageMentions.EVERYONE_PATTERN)) return message.channel.send("Please enter a valid map name.")
        if (await db.isFollowingMap(message.author.id, map)) return message.channel.send("You are already following this map.")

        db.followMap(message.author.id, map)
        message.react("👍")
        message.channel.send("You are now following " + map + ". You will be notified when the map comes on a server.").then(msg => {
            //react undo sign
            msg.react("↩️").then(reaction => {
                const filter = (reaction, user) => reaction.emoji.name === '↩️' && user.id === message.author.id;
                const collector = msg.createReactionCollector(filter, { time: 30000 });
                collector.on('collect', r => {
                    db.unfollowMap(message.author.id, map)
                    msg.delete();
                    message.delete();

                    message.channel.send("You are no longer following " + map + ".")
                });
                collector.on("end", () => {
                    reaction.remove();
                })
            });

        })
        console.log(message.author.tag + " followed map " + map)

        let logEmbed = new Discord.MessageEmbed()
            .setTitle("User Followed Map")
            .setColor(7980240)
            .setTimestamp(Date.now())
            .addField("User", message.author)
            .addField("Map", map)
            .setThumbnail(message.author.displayAvatarURL())
            .setAuthor(message.author.tag, message.author.displayAvatarURL())

        logChannel.send({ embed: logEmbed })
    }
    else if (command == "unfollow" || command == "uf") {
        let map = args.join(" ").toLowerCase();
        if (!map || map.match(Discord.MessageMentions.USERS_PATTERN) || map.match(Discord.MessageMentions.ROLES_PATTERN) || map.match(Discord.MessageMentions.EVERYONE_PATTERN)) return message.channel.send("Please enter a valid map name.")
        //if the args is "all" unfollow all maps
        if (map == "all") {
            db.unfollowAll(message.author.id)
            message.react("👍")
            message.channel.send("You are no longer following any maps.")
            console.log(message.author.tag + " unfollowed all maps")
        } else {
            //if user isnt following the map
            if (!await db.isFollowingMap(message.author.id, map)) return message.channel.send("You are not following this map.")
            db.unfollowMap(message.author.id, map)
            message.react("👍")
            message.channel.send("You are no longer following " + map + ".")
            console.log(message.author.tag + " unfollowed map " + map)
        }
        let logEmbed = new Discord.MessageEmbed()
            .setTitle("User Unfollowed Map")
            .setColor(7980240)
            .setTimestamp(Date.now())
            .addField("User", message.author)
            .addField("Map", map)
            .setThumbnail(message.author.displayAvatarURL())
            .setAuthor(message.author.tag, message.author.displayAvatarURL())

        logChannel.send({ embed: logEmbed })
    }
    else if (command == "listfollows" || command == "lf") {
        //list all users follows
        let follows = await db.getUserFollows(message.author.id)
        // console.log(follows)
        if (follows.length == 0) return message.channel.send("You are not following any maps.")
        let list = "";
        for (let i in follows) {
            let stats = getStatsPage(follows[i].map_name)
            if (stats) {
                list += `[${follows[i].map_name}](${stats})` + "\n"
            } else {
                list += follows[i].map_name + "\n"
            }
        }
        let embed = new Discord.MessageEmbed()
            .setTitle(`List of maps you are following:`)
            .setColor(7980240)
            .setTimestamp(Date.now())
            .setDescription(list)
        message.channel.send({ embed: embed }).then(msg => addTrash(msg));

    }

})


bot.on('message', async message => {//dev commands

    if (!allowedDevs.includes(message.author.id)) return;//if not frumpy or sneak no commands will run


    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;
    if (message.author.bot) return;

    if (command == "id") {
        message.channel.send("does sneak gay?").then(m => {
            m.edit(m.id);
        })
    }

    else if (command == "mem") {
        let used = process.memoryUsage();
        let out = "```";
        for (let key in used) {
            out += `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB\n`
        }
        out += "```"

        message.channel.send(out);
    }



    else if (command == "check") {
        let ip = args[0]

        if (!args[0]) return message.channel.send("Please enter an ip.")

        let embed = await checkIP(ip);

        if (!embed) return message.channel.send("The server is unavailable.")

        message.channel.send({ embed: embed }).then(msg => addTrash(msg));
    }
    else if (command == "listallfollows" || command == "laf") {
        let follows = await db.getAllFollows()
        //sort follows by discord id
        follows.sort((a, b) => {
            if (a.discord_id < b.discord_id) return -1;
            if (a.discord_id > b.discord_id) return 1;
            return 0;
        })
        // console.log(follows)
        if (!follows) return message.channel.send("There are no users following any maps.")
        let list = "";
        for (let i in follows) {
            let stats = getStatsPage(follows[i].map_name)
            // list += "<@" + follows[i].discord_id + ">" + ": " + `[${follows[i].map_name}](${getStatsPage(follows[i].map_name)})` + "\n"
            if (stats) {
                // list += `[${follows[i].map_name}](${stats})` + "\n"
                // "<@" + follows[i].discord_id + ">" + ": " + `[${follows[i].map_name}](${getStatsPage(follows[i].map_name)})` + "\n"
                list += "<@" + follows[i].discord_id + ">" + ": " + `[${follows[i].map_name}](${stats})` + "\n"
            } else {
                list += "<@" + follows[i].discord_id + ">" + ": " + follows[i].map_name + "\n";
            }
        }
        let embed = new Discord.MessageEmbed()
            .setTitle(`List of all followed maps:`)
            .setColor(7980240)
            .setTimestamp(Date.now())
            .setDescription(list)
        message.channel.send({ embed: embed }).then(msg => addTrash(msg));
    }
    else if (command == "testnotify") {
        let map = args.join(" ").toLowerCase();
        if (!map) return message.channel.send("Please enter a valid map name.")
        //if the map isnt in the database
        if (!db.hasMap(map)) return message.channel.send("No one is following this map.")
        //react a thumbs up to the message
        message.react("👍")
        notifyUsers(map)
    }

    else if(command == "removeuser"){
        let userID = args[0];
        if(!userID) return message.channel.send("Please enter a valid user ID.")
        db.unfollowAll(userID);
        message.channel.send("Removed all maps from user <@" + userID + ">.");
    }
})

async function checkIP(ip) {

    let port = "27015";

    if (ip.includes(":")) {
        port = ip.split(":")[1]
        ip = ip.split(":")[0]
    }

    let valid = true;

    let res = await Gamedig.query({
        type: "csgo",
        host: ip,
        port: port
    }).catch(e => {
        valid = false;
    })

    if (!valid) return false;

    let data = {
        name: res.name,//Short nickname
        fullIP: res.connect,//String with ip:port
        map: res.map,//Current map
        maxPlayers: res.maxplayers,
        players: res.players,//Players array {name, score, time}
        bots: res.bots,//Bots array {name, score, time}
        numPlayers: res.raw.numplayers - res.raw.numbots,//int
        numBots: res.raw.numbots,//int
    }


    let image = getMapImage(data.map)

    let embed = new Discord.MessageEmbed()
        .setTitle(`${data.numPlayers} (${data.numBots}) / ${data.maxPlayers} players connected to ${data.name} on ${data.map}`.replace(/\_/g, "\\_"))
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())
    if (image) embed.setImage(image);

    let list = "";

    for (let i in data.players) {
        let player = data.players[i];

        list += player.name + "\n"
    }

    for (let i in data.bots) {
        let bot = data.bots[i];

        list += bot.name += "\n";
    }

    list = list.replace(/\`/g, "'").replace(/\*/g, "\\*").replace(/\_/g, "\\_").replace(/undefined\n/g, "");//removes back ticks for discord, and removes connecting players... i think

    embed.setDescription(list);

    return embed;




}

let notifyUsers = async function (map, server, ip) {
    let users = await db.getUsersFollowingMap(map)
    for (let i in users) {
        let user = users[i];
        //console.log(user)


        bot.users.fetch(user.discord_id).then(u => {
            // u.send(`${map} is now on ${server}!\nsteam://connect/${ip}`)
            //make embed
            let stats = getStatsPage(map)
            let dmEmbed = new Discord.MessageEmbed()
                .setTitle(`${map} is now on ${server}!`)
                .setColor(7980240)
                .setFooter("Last Updated", frumpyAvatarLink)
                .setTimestamp(Date.now())
            if (stats) dmEmbed.setURL(stats)
            if (getMapImage(map)) dmEmbed.setImage(getMapImage(map))
            u.send({
                embed: dmEmbed,
                content: `${map} is now on ${server}!\nsteam://connect/${ip}`
            }).catch(e => {
                let embed = new Discord.MessageEmbed()
                    .setTitle(`${map} is now on ${server}!`)
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                if (stats) embed.setURL(stats)
                if (getMapImage(map)) embed.setImage(getMapImage(map))
                bot.guilds.cache.get("253812864786235402").channels.cache.get("269171320732778496").send({ embed: embed, content: `${u}\n${map} is now on ${server}!\nsteam://connect/${ip}` })
            })
            //make embed for logging channel
            let logEmbed = new Discord.MessageEmbed()
                .setTitle(`Notification has been sent.`)
                .setColor(7980240)
                .setTimestamp(Date.now())
                .setDescription(`${u} was sent a notification for ${map} on ${server}!`)
                .setAuthor(u.tag, u.displayAvatarURL())
                .setThumbnail(u.displayAvatarURL())
            logChannel.send({ embed: logEmbed })
            console.log(`Sent notification to ${u.tag} about ${map}`)

        })
    }
}

let oldData = {}
for (server in Object.keys(serverObject)) {
    oldData[Object.keys(serverObject)[server]] = 0
}


bot.setInterval(async function () {
    for (server in Object.keys(oldData)) {
        if (oldData == 0) oldData[Object.keys(oldData)[server]] = gData[Object.keys(gData)[server]].map;
        else {
            if (oldData[Object.keys(oldData)[server]] != gData[Object.keys(gData)[server]].map) {
                notifyUsers(gData[Object.keys(gData)[server]].map, Object.values(serverObject)[server].nick, Object.values(serverObject)[server].ip)
                oldData[Object.keys(oldData)[server]] = gData[Object.keys(gData)[server]].map;
            }
        }
    }
    // console.log(oldData)
}, 91000);

//if a member leaves delete all their follows in db
bot.on("guildMemberRemove", async member => {
    db.unfollowAll(member.id)
});

