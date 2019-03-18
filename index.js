const game = require('gamedig'); //Requires gamedig
const Discord = require('discord.js'); //Requires Discord.js
const bot = new Discord.Client(); //Creates new Discord Client
const {
    token,
    channelID,
    messageID
} = require('./config.json');

var version = '3.420'



var gData = {} //Init Global Data

var playersCommand = true


bot.login(token) //Logs in Bot 



var servers = { //Creates servers obj
    csgo: { //Creates CSGO servers obj
        Beginner_Surf: {
            ip: '216.52.143.73:27015',
            nick: 'Beginner Surf'
        },
        Easy_Surf: {
            ip: '74.91.113.236:27015',
            nick: 'Easy Surf'
        },
        Advanced_Surf: {
            ip: '74.91.113.133:27015',
            nick: 'Advanced Surf'
        },
        Top100SLASHVIP_Surf: {
            ip: '74.91.113.133:27017',
            nick: 'Top 100/VIP Surf'
        },
        KZ_Climb: {
            ip: '162.248.92.83:27015',
            nick: 'KZ Climb'
        },
        GOKZ_Climb: {
            ip: '162.248.92.83:27017',
            nick: 'GOKZ Climb'
        },
        Top100SLASHVIP_KZ: {
            ip: '162.248.92.83:27025',
            nick: 'Top 100/VIP KZ'
        },
        n1v1_Arenas_1: {
            ip: '74.91.119.186:27015',
            nick: '1v1 Arenas #1'
        },
        n1v1_Arenas_2: {
            ip: '74.91.119.186:27017',
            nick: '1v1 Arenas #2'
        },
        Retakes_1: {
            ip: '72.5.195.31:27015',
            nick: 'Retakes #1'
        },
        Retakes_2: {
            ip: '72.5.195.31:27017',
            nick: 'Retakes #2'
        },
        FFA_Deathmatch: {
            ip: '74.91.119.186:27019',
            nick: 'FFA Deathmatch'
        },
        Bhop: {
            ip: '162.248.92.80:27015',
            nick: 'Bhop'
        },
        Minigames: {
            ip: '74.91.113.198:27015',
            nick: 'Minigames'
        },
        CSCO_Casual: {
            ip: '74.91.119.52:27015',
            nick: 'CSCO Casual'
        }
    },

}



async function gameSplit(s) { //Splits Games Between CSGO and Minecraft(deprecated)
    var csgo = s.csgo //Takes CSGO server obj out of Servers Object
    var done = new Object() //Creates new Done obj for filtered games

    if (Object.entries(csgo).length) { //Checks size of CSGO servers obj
        var checked = await errorCheck(await csgoCheck(csgo)) //Returns servers that have responed to query//if a value in array is "error" it is removed //csgoCheck returns array of objects. if error returns "error"
        done['csgo'] = checked //Creates sub object in done object

    }

    return done; //returns CSGO server data
}



async function csgoCheck(s) {

    var r = [] //Creates array for responces 
    for (var i = 0; i < Object.values(s).length; i++) { //ForLoop for each csgo server
        var ip = Object.values(s)[i].ip.split(':')[0] //Takes server ip and splits on ":" and takes first element. //IP
        var port = Object.values(s)[i].ip.split(':')[1] //Takes server ip and splits on ":" and takes seccond element. //PORT
        var data = await game.query({ //Querys CSGO server
            type: 'csgo',
            host: ip,
            port: port,
            maxAttempts: 3,
        }).catch(e => { //if error push "error" to array
            r.push('error')
        })
        data.notes = [Object.keys(s)[i], Object.values(s)[i].nick]
        r.push(data) //if NO error push responce obj to array
        //console.log(data)
    }

    return r //Function returns array of objects
}

async function errorCheck(arr) { //Checks if Arr includes "error" if so it is removed
    if (arr.includes('error')) {
        arr = arr.filter(function (item) {
            if (item !== 'error') { //if not error return item
                return item;
            }


        })

    }
    return arr; //Returns Arr of objs without errors
}

async function run() { //Starts query and filter



    let data = await gameSplit(servers) //Splits games into their own objects
    //console.log(data)

    let csgoData = data.csgo //Takes csgo data out of split

    var done = { //Creates empty object for forloop to enter data
        csgo: {

        },

    }
    for (var i = 0; i < csgoData.length; i++) { //Loops thru csgo servers

        done.csgo[csgoData[i].notes[0]] = { //Creates new obj in done.csgo for each server
            serverName: csgoData[i].notes[1], //Takes server name and replaces place holders for forbidden var names with the forbidden chars 
            mapName: csgoData[i].map, //Current server map
            onlinePlayers: csgoData[i].raw.numplayers, //Number of online players
            botPlayers: csgoData[i].raw.numbots, //Number of bots
            maxPlayers: csgoData[i].maxplayers, //Max ammount of players on server
            playersArray: csgoData[i].players, //Array of online players. Each entry is an object with name,score,time vars.
            botsArray: csgoData[i].bots,
            server: { //Creates sub object for server infomation
                ip: csgoData[i].connect, //IP+port
                host: csgoData[i].connect.split(':')[0], //IP only
                port: csgoData[i].connect.split(':')[1] //Port Only
            }
        }
    }
    done.updated = Date.now()
    return done; //Returns object with all of csgo server data. done.csgo.serverSteamID is an object with server data
}


async function go() {
    console.log(await run())
}




bot.on('ready', async () => { //Event is fired when the bot logins into discord
    console.log(bot.user.tag) //Logs bot's discord tag
    bot.user.setActivity('--players in #bot-commands')
    var channel = channelID //Define the channel which the embed will be placed in
    var msg = messageID //Define the message that the bot will update. Message must be sent by the bot. Use the command --id in the channel where you want the embed to get the message id

    bot.channels.get(channel).fetchMessage(msg).then(m => { //Fetches the channel and the message and returns callback 'm' which is the message that will be updated.
        bot.setInterval(async () => { //Creates timer that will run every x ms. x is defined on line 151

            gData = await run() //Runs the run function which returns the done.csgo object. Sets gData to this data so it can be called in other functions.
            var embed = new Discord.RichEmbed() //Creates discord embed
                .setTitle('Server List') //Adds title
                .setDescription('This list is updated every 1.5 minutes.') //Adds description
                .setTimestamp(gData.updated) //Adds timestamp of last update
                .setFooter('Last Updated', 'https://snksrv.com/frumpy.gif') //Sets footer message and sets embed icon
                .setColor(7980240) //Sets the color of the embed

            for (var i = 0; i < Object.keys(gData.csgo).length; i++) { //Creats forloop to run thru each csgo server to make a embed field for each server
                var server = gData.csgo[Object.keys(gData.csgo)[i]] //Defines server as each server in gData object
                embed.addField(server.serverName, `**__Players:__** ${Number(server.onlinePlayers) - Number(server.botPlayers)} (${server.botPlayers}) / ${server.maxPlayers}\n**__Map:__** ${server.mapName}\n**__IP:__** ${server.server.ip}`) //Adds embed field with server info
            }
            m.edit({
                embed: embed
            }) //Edits embed with most recent update of embed

        }, 90000) //Sets interval in ms for function to run
    })
})

bot.on('message', async message => { //Event is fired when a message is sent //Maintenance commands//ONLY TO BE USED BY FRUMPY AND SNEAK
    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()

    if (!message.content.startsWith(prefix)) return;

    if (message.author.bot) return;
    if (!['134088598684303360', '204729465564037120'].includes(message.author.id)) return; //If the message is not from Frumpy#0072 the bot will do nothing


    if (command === 'id') { //This command will make the bot send a message and then edit the message to be the ID of the message.
        message.channel.send('Running...').then(m => { //Sends 'Running...' then returns the message that was sent.
            m.edit(m.id) //Edits the message to be the ID of the message
        })
    } else if (command === 'test') { //Command will test the embed by pulling data from gData and making a new embed

        if (Object.keys(gData).length === 0) return message.channel.send('please wait'); //If the bot has not been online for 3 mins or no servers are responding the bot will send a message saying 'Please Wait.'

        var embed = new Discord.RichEmbed() //Creates discord embed
            .setTitle('Server List') //Adds title
            .setDescription('This list is updated every 1.5 minutes.') //Adds description
            .setTimestamp(gData.updated) //Adds timestamp of last update
            .setFooter('Last Updated', 'https://snksrv.com/frumpy.gif') //Sets footer message and sets embed icon
            .setColor(7980240) //Sets the color of the embed

        for (var i = 0; i < Object.keys(gData.csgo).length; i++) { //Creats forloop to run thru each csgo server to make a embed field for each server
            var server = gData.csgo[Object.keys(gData.csgo)[i]] //Defines server as each server in gData object
            embed.addField(server.serverName, `**__Players:__** ${Number(server.onlinePlayers) - Number(server.botPlayers)} (${server.botPlayers}) / ${server.maxPlayers}\n**__Map:__** ${server.mapName}\n**__IP:__** ${server.server.ip}`) //Adds embed field with server info
        }



        message.channel.send({ //Sends the embed to the channel where orginal message was sent
            embed: embed
        })


    } else if (command === 'fasttest') { //This command will test the embed but will not take data from gData. When this command is ran it will start the query process again.
        message.channel.send('running..')
        var data = await run() //Data is defined as the done object
        gData = data


        var embed = new Discord.RichEmbed() //Creates discord embed
            .setTitle('Server List') //Adds title
            .setDescription('This list is updated every 1.5 minutes.') //Adds description
            .setTimestamp(data.updated) //Adds timestamp of last update
            .setFooter('Last Updated', 'https://snksrv.com/frumpy.gif') //Sets footer message and sets embed icon
            .setColor(7980240) //Sets the color of the embed

        for (var i = 0; i < Object.keys(data.csgo).length; i++) { //Creates forloop for each csgo server
            var server = data.csgo[Object.keys(data.csgo)[i]] //Defines server as each csgo server
            embed.addField(server.serverName, `**__Players:__** ${Number(server.onlinePlayers) - Number(server.botPlayers)} (${server.botPlayers}) / ${server.maxPlayers}\n**__Map:__** ${server.mapName}\n**__IP:__** ${server.server.ip}`) //Adds embed field for each csgo server
        }



        message.channel.send({ //Send the finished embed to the channel where the orginal message was sent.
            embed: embed
        })


    } else if (command === 'toggleplayerscommand') {
        if (!args[0]) return;
        if (args[0].toLowerCase() === 'true') {
            playersCommand = true
            message.react('?')
        } else if (args[0].toLowerCase() === 'false') {
            playersCommand = false
            message.react('?')
        } else {
            return console.log('error toggling players command');
        }
    } else if (command === 'v') {
        message.channel.send(version)
    }

})


bot.on('message', async message => {
    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

    if (!['308362832557113344', '269171320732778496', '546037656887361567', '546037725116235787'].includes(message.channel.id) && message.channel.type !== 'dm') {
        //if(['134088598684303360', '204729465564037120'].includes(message.author.id)) return;
        message.delete().catch(e => console.log)
        message.author.send('Please only use this command in #bot-commands or in my DM channel.')
        return;
    }

    if (command === 'players') {

        if (playersCommand !== true) return;

        if (gData.size === 0) return message.channel.send('Please wait the bot is starting')


        if (args.length === 0) {
            //console.log(gData.csgo[Object.keys(gData.csgo)[0]])
            var list = "Please specify what sever you want to check."
            var num = 1
            Object.keys(gData.csgo).forEach(s => {
                list += `\n${num}: ${gData.csgo[s].serverName}: ${Number(gData.csgo[s].onlinePlayers) - Number(gData.csgo[s].botPlayers)} (${gData.csgo[s].botPlayers}) / ${gData.csgo[s].maxPlayers} on ${gData.csgo[s].mapName}`
                num++
            })

            message.channel.send(list)




        } else {
            
            var embed;
            if(gData.csgo[Object.keys(gData.csgo)[args[0]-1]].onlinePlayers > gData.csgo[Object.keys(gData.csgo)[args[0] - 1]].playersArray.length){
                embed = {
                    "title": `${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].onlinePlayers} / ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].maxPlayers} players connected to ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].serverName} on ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].mapName}`,
                    "description": (gData.csgo[Object.keys(gData.csgo)[args[0] - 1]].playersArray.map(player => player.name).join('\n')) ? (gData.csgo[Object.keys(gData.csgo)[args[0] - 1]].playersArray.map(player => player.name).join('\n') ) : 'No players currently online.',
                    "color": 7980240,
                    "timestamp": gData.updated,
                    "footer": {
                        "icon_url": "https://snksrv.com/frumpy.gif",
                        "text": "Last Updated"
                    }
                };
            } else {
                embed = {
                    "title": `${Number(gData.csgo[Object.keys(gData.csgo)[args[0]-1]].onlinePlayers) - Number(gData.csgo[Object.keys(gData.csgo)[args[0]-1]].botPlayers)} / ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].maxPlayers} players connected to ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].serverName} on ${gData.csgo[Object.keys(gData.csgo)[args[0]-1]].mapName}`,
                    "description": (gData.csgo[Object.keys(gData.csgo)[args[0] - 1]].playersArray.map(player => player.name).join('\n')) ? (gData.csgo[Object.keys(gData.csgo)[args[0] - 1]].playersArray.map(player => player.name).join('\n')) : 'No players currently online.',
                    "color": 7980240,
                    "timestamp": gData.updated,
                    "footer": {
                        "icon_url": "https://snksrv.com/frumpy.gif",
                        "text": "Last Updated"
                    }
                };
            }

            message.channel.send({
                embed: embed
            })
        }
    }




})

bot.on('error', console.error)