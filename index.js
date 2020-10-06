const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;

let allowedDevs = ["134088598684303360", "204729465564037120"];


bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--players in #bot-commands");
    frumpyAvatarLink = bot.users.cache.get("134088598684303360").avatarURL() || "https://i.imgur.com/cBiDnMi.png"

    intervalFunction();

    bot.setInterval(intervalFunction, config.intervalMS)//starts embed update loop

})

async function intervalFunction() {

    // console.time("all")

    await refresh(serverObject);

    bot.channels.cache.get(config.channelID).messages.fetch(config.messageID).then(async m => {//fetches config message
        m.edit("‎", { embed: await makeEmbed() })//sends embed with blank char
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
        port: port
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
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())

    for (let s in gData) {//makes field for ever server 
        let server = gData[s];

        if (!server.show) continue;

        if (server.online) {
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

bot.on('message', async message => {//public commands

    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

    if (command == "players" || command == "p") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({ embed: await makeServerList() })
        }

        let server = await keywordToServer(args.join(" ").toLowerCase());

        if (server == false) {
            return message.channel.send("Please enter a valid server.");
        } else {//if returns valid server obj
            let embed = await playerListEmbed(server);

            message.channel.send({ embed: embed })
        }


    }

    if (command == "map" || command == "m") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({embed: await makeServerList()})
        }

        let server = await keywordToServer(args.join(" ").toLowerCase());

        if (server == false) {
            return message.channel.send("Please choose a valid server.");
        } else {

            let embed;

            if (server.online) {

                let image = getMapImage(server.map)
                let stats = getStatsPage(server.map)

                embed = new Discord.MessageEmbed()
                    .setTitle(`${server.name} is currently on ${server.map}`)
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                    if(stats) embed.setURL(stats)
                    if(image) embed.setImage(image)

            }else {

                embed = new Discord.MessageEmbed()
                    .setTitle(`${server.name} is currently unavailable.`)
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                    .setImage("https://i.imgur.com/WnS0Biz.png")

            }

            message.channel.send({embed: embed})

        }

    }

})


bot.on('message', async message => {//dev commands

    if (!allowedDevs.includes(message.author.id)) return;//if not frumpy or sneak no commands will run

    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

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
})

function keywordToServer(keyword) {
    for (let s in gData) {
        let server = gData[s];

        if (server.keywords.includes(keyword) || server.index == keyword) {
            return gData[s];
        }
    }
    return false;
}

function isEmpty(obj) {//checks if bot has started//if empty bot is starting
    for (var key in obj) {
        if (obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function playerListEmbed(server) {

    let embed;

    if (server.online) {
        embed = new Discord.MessageEmbed()
            .setTitle(`${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${server.name} on ${server.map}`)
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

        list = list.replace(/\`/g, "'").replace(/undefined\n/g, "");//removes back ticks for discord, and removes connecting players... i think

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

function makeServerList() {
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

function getMapImage(mapName){
    if (mapName.startsWith("surf_") || mapName.startsWith("bhop_")) {
        return `https://snksrv.com/bans/images/maps/${mapName}.jpg`
    } else if (mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")) {
        return `https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/${mapName}.jpg`
    } else {
        return false;
    }
}

function getStatsPage(mapName){
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