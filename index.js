const express = require('express')
const bodyParser = require('body-parser')

const app = express()
const port = 3000

app.set('view engine', 'ejs')

app.use(express.static('public'))

app.use(bodyParser.json())

const fs = require('fs')

const readline = require('readline')
const { google } = require('googleapis')

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl']

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json'

const start_function = (callback) => {
    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err)
        // Authorize a client with credentials, then call the Google Sheets API.
        authorize(JSON.parse(content), callback)
    })
}

const authorize = (credentials, callback) => {
    const { client_secret, client_id, redirect_uris } = credentials.installed
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback)
        oAuth2Client.setCredentials(JSON.parse(token))
        callback(oAuth2Client)
    })
}

const getNewToken = (oAuth2Client, callback) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    })
    
    console.log('Authorize this app by visiting this url:', authUrl)
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close()
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err)
            oAuth2Client.setCredentials(token)
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err)
                console.log('Token stored to', TOKEN_PATH)
            })
            callback(oAuth2Client)
        })
    })
}

const getBroadcast = (auth) => {
    const service = google.youtube('v3')

    // GET Broadcast request
    const request = {
        auth: auth,
        part: 'id, snippet, contentDetails, status',
        id: 'SHwKywDc978',
    }

    service.liveBroadcasts.list(request, (err, response) => {
        if (err) return console.log('The API returned an error: ' + err)
        const broadcast = response.data.items[0]
        console.log(`${broadcast.snippet.channelId} is livestreaming about ${broadcast.snippet.title}`)
        
        // GET Chat Messages request
        const chatRequest = {
            auth: auth,
            part: 'id, snippet, authorDetails',
            liveChatId: broadcast.snippet.liveChatId,
            PageToken: 'nextPageToken',
        }

        service.liveChatMessages.list(chatRequest, (err, response) => {
            if (err) return console.log('The API returned an error: ' + err)
            const messages = response.data.items
            messages.forEach((message) => {
                // Get message age
                const sentAt = new Date(message.snippet.publishedAt)
                const diff = new Date() - sentAt
                var diffMins = Math.round(((diff % 86400000) % 3600000) / 60000)
                // console.log(`${message.authorDetails.displayName} said "${message.snippet.displayMessage}" ${diffMins} minutes ago`

                // Check if message is command and if it has already been processed
                if (message.snippet.displayMessage.startsWith('/') && diffMins < 0.5) {
                    commands(message.snippet.displayMessage, broadcast.snippet.liveChatId)
                }
            })
            setTimeout(function(){ start_function(getBroadcast) }, 30000); // Check chat for commands every 30 seconds
        })
    })
}

// Command logic
const commands = (command, chatId) => {
    const commands = [' /help', ' /stats', ' /dc']
    const _channel = getChannel('UCbZRGXMhWPva6OZydKs70ng') // Get channel information
    switch (command) {
        case '/help':
            // Send list of commands
            sendMessage(`Available commands: ${commands}`, chatId)
            break
        case '/stats':
            // Send channel stats
            setTimeout(function () {
                sendMessage(
                    `
            Name: ${channel.snippet.title} • \n
            Subscribers: ${channel.statistics.subscriberCount} • \n
            Viewcount: ${channel.statistics.viewCount} • \n
            Videos: ${channel.statistics.videoCount} \n
            `,
                    chatId
                )
            }, 3000)
            break
        case '/dc':
            // Send discord server
            setTimeout(function () {
                sendMessage(`💬 ᴅɪꜱᴄᴏʀᴅ ꜱᴇʀᴠᴇʀ: https://shorturl.at/lmyLN`, chatId)
            }, 3000)
            break
        default:
            // Not a valid command
            console.log('invalid command')
            break
    }
}

// Send message to chat
const sendMessage = (message, chatId) => {
    // Authorize without callback functions
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err)
        const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) return getNewToken(oAuth2Client, callback)
            oAuth2Client.setCredentials(JSON.parse(token))

            const service = google.youtube('v3')

            // POST chat message request
            const request = {
                auth: oAuth2Client,
                part: ['snippet'],
                resource: {
                    snippet: {
                        liveChatId: chatId,
                        type: 'textMessageEvent',
                        textMessageDetails: {
                            messageText: message,
                        },
                    },
                },
            }

            // Send message
            service.liveChatMessages.insert(request, (err, response) => {
                if (err) return console.log('The API returned an error: ' + err)
                console.log(response.data)
            })
        })
    })
}

// Get channel info
const getChannel = (channelId) => {
    return new Promise(function (resolve, reject) {
        fs.readFile('credentials.json', (err, content) => {
            if (err) return console.log('Error loading client secret file:', err)
            const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
            fs.readFile(TOKEN_PATH, (err, token) => {
                if (err) return getNewToken(oAuth2Client, callback)
                oAuth2Client.setCredentials(JSON.parse(token))
                const service = google.youtube('v3')

                const request = {
                    auth: oAuth2Client,
                    part: 'snippet,contentDetails,statistics',
                    id: channelId,
                }

                service.channels.list(request, (err, response) => {
                    if (err) return reject('The API returned an error: ' + err)
                    const channels = response.data.items
                    if (channels.length == 0) {
                        console.log('No channel found.')
                    } else {
                        this.channel = channels[0]
                        console.log(`This channel's ID is ${channels[0].id}.
                             Its title is ${channels[0].snippet.title},
                             it has ${channels[0].statistics.viewCount} views and
                             it has ${channels[0].statistics.subscriberCount} subscribers.`)
                        resolve(this)
                    }
                })
            })
        })
    })
}

// Start chatbot
start_function(getBroadcast)

// Display subscribercount for obs
app.get('/', (req, res) => {
    const _channel = getChannel('UCbZRGXMhWPva6OZydKs70ng')
    setTimeout(function () {
        res.render('subscriberCount', { subscribers: channel.statistics.subscriberCount })
    }, 1000)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})
