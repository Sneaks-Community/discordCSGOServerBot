const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;


bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--players in #bot-commands");
    frumpyAvatarLink = bot.users.cache.get("134088598684303360").avatarURL() || "https://i.imgur.com/cBiDnMi.png"

    bot.setInterval(intervalFunction, config.intervalMS)

})

async function intervalFunction(){

    // console.time("all")

    await refresh(serverObject);

    bot.channels.cache.get(config.channelID).messages.fetch(config.messageID).then(async m => {
        m.edit("‎", {embed: await makeEmbed()})
    })

    // console.timeEnd("all")

}

async function refresh(servers){

    let allData = {}

    for(let s in servers){//loops thru servers 
        allData[s] = await getInfo(servers[s])//gets info from server 
    }
    
    gData = allData;//overwrites Global data var
}

async function getInfo(server){

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

    if(valid){
        data = {
            online: true,
            name: server.nick,//Short nickname
            fullIP: res.connect,//String with ip:port
            map: res.map,//Current map
            maxPlayers: res.maxplayers,
            players: res.players,//Players array {name, score, time}
            bots: res.bots,//Bots array {name, score, time}
            numPlayers: res.raw.numplayers,//int
            numBots: res.raw.numbots,//int
            show: server.show,//bool to print server in embed
            keywords: server.keywords//array of keywords for --players command
        }
    }
    else{
        data = {
            name: server.nick,
            online: false
        }
    }

    // console.timeEnd("server")

    return data;
}

function makeEmbed(){
    // console.time("embed")
    let embed = new Discord.MessageEmbed()
    .setTitle("Server List")
    .setColor(7980240)
    .setFooter("Last Updated", frumpyAvatarLink)
    .setTimestamp(Date.now())

    for(let s in gData){
        let server = gData[s];

        if(server.online){
            embed.addField(
                server.name,
                `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}
                **__Map:__** ${getWebsite(server.map)}
                **__IP:__** ${server.fullIP}`
            )    
        }else{
            embed.addField(
                server.name,
                "**Server is offline.**"
            )
        }

    }
    // console.timeEnd("embed")
    return embed;
}

function getWebsite(mapName){
    //https://snksrv.com/surfstats/?view=map&name=x
    //https://snksrv.com/kzstats/#/maps/x
    if(mapName.startsWith("surf_")){
        return `[${mapName}](https://snksrv.com/surfstats/?view=map&name=${mapName})`
    } else if(mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")){
        return `[${mapName}](https://snksrv.com/kzstats/#/maps/${mapName})`
    } else{
        return mapName
    }
    
}


bot.on('message', async message => {
    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

    if(command == "id"){
        message.channel.send("does sneak gay?").then(m => {
            m.edit(m.id);
        })
    }
})