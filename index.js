const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;

let allowedDevs = ["134088598684303360", "204729465564037120"];

const prefix = '--';

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
    bot.user.setActivity("--players in #bot-commands");
    let frumpy = await bot.users.fetch("134088598684303360")
    frumpyAvatarLink = frumpy.avatarURL() || "https://i.imgur.com/cBiDnMi.png"

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

bot.on('message', async message => {//public commands

    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;
    if (message.author.bot) return;

    if (command == "players" || command == "p") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({ embed: await makeServerList() })
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

            message.channel.send({ embed: embed })
        }


    }

    else if (command == "map" || command == "m") {
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.")
        }

        if (args.length == 0) {
            return message.channel.send({ embed: await makeServerList() })
        }

        let server = await keywordToServer(args.join(" ").toLowerCase());

        if (!server) {
            return message.channel.send("Please choose a valid server.");
        } else {

            let embed;

            if (server.online) {

                let image = getMapImage(server.map)
                let stats = getStatsPage(server.map)

                embed = new Discord.MessageEmbed()
                    .setTitle(`${server.name} is currently on ${server.map}`.replace(/\_/g, "\\_"))
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                if (stats) embed.setURL(stats)
                if (image) embed.setImage(image)

            } else {

                embed = new Discord.MessageEmbed()
                    .setTitle(`${server.name} is currently unavailable.`)
                    .setColor(7980240)
                    .setFooter("Last Updated", frumpyAvatarLink)
                    .setTimestamp(Date.now())
                    .setImage("https://i.imgur.com/WnS0Biz.png")

            }

            message.channel.send({ embed: embed })

        }

    }

    else if (command == "help" || command == "commands") {
        let embed = new Discord.MessageEmbed()
            .setTitle(`List of commands`)
            .setColor(7980240)
            .setTimestamp(Date.now())
            .addField("--players/--p", "`--players <server>`\nThis command will return a list of currently connected users to the specified server.")
            .addField("--map/--m", "`--map <Server>`\nThis command return with what map a server is on, along with any other relevant information about the map.")

        message.channel.send({ embed: embed })
    }

    else if(command == "keywords" || command == "keys"){
        let list = "";
        
        for(let i in serverObject){
            let server = serverObject[i];
            list += "**" + server.nick + ":**\n"
            for(let k of server.keywords){
                list += "\t" + k;
            }
            list += "\n"
        }

        message.channel.send(list)
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

    else if (command == "listallplayers") {
        let list = "";
        let embed = new Discord.MessageEmbed()
            .setTitle(`All Players`)
            .setColor(7980240)
            .setTimestamp(Date.now())


        for (let i in gData) {
            let server = gData[i];

            list += "**" + server.name + "**\n";

            for (let p of server.players) {
                if (p.name == undefined) continue;
                list += p.name + "\n";
            }
            list += "\n\n";

        }

        embed.setDescription(list)

        message.author.send({ embed: embed })
    }
})