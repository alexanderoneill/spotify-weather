// ============================================================================== CONSTANTS, DEFINITIONS, AND EXTENSIONS

// Spotify auth stuff
const spClientId = "b5af9f02259b418cb6e80425b55a6226"
const params = new URLSearchParams(window.location.search)
const spCode = params.get("code")
const default_timeframe = "medium_term"

// Pirate Weather access key
const pwKey = "Qx1wavydstRGvUBn3EkZz6D3RvrX2Ajk"

// Event listener for generation button
document.querySelector('#create-playlist-button').addEventListener('click', (e:Event) => createPlaylist(pwKey, spClientId, spCode, default_timeframe))

// Used specifically to avoid having to use a global for user coords
let getLocationPromise = new Promise((resolve, reject) => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            let lat = position.coords.latitude
            let long = position.coords.longitude

            resolve({latitude: lat,
                longitude: long})
        })
    } else {
        reject("Location services are not supported by this browser")
    }
})



// ======================================================================================================= AUTHORISATION

// Begin auth flow, accepts app client ID.
async function spRedirectToAuthCodeFlow(spClientId: string) {

    // Define 128-char verifier and invoke code challenge with this verifier
    const verifier = generateCodeVerifier(128)
    const challenge = await generateCodeChallenge(verifier)

    // Save verifier string to local storage
    localStorage.setItem("verifier", verifier)

    // Build URL params
    const params = new URLSearchParams()
    params.append("client_id", spClientId)
    params.append("response_type", "code")
    params.append("redirect_uri", "http://localhost:5173/callback")
    params.append("scope", "user-read-private user-top-read playlist-modify-public playlist-modify-private")
    params.append("code_challenge_method", "S256")
    params.append("code_challenge", challenge)

    // Return Spotify Auth URL with appended URL params
    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`
}

// Generate a random string of alphanumeric characters of a given length
function generateCodeVerifier(length: number) {
    var text = ''
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

// Encode verifier string and hash it with SHA-256
// Return b64 representation of digest (hash)
async function generateCodeChallenge(codeVerifier: string) {
    const data = new TextEncoder().encode(codeVerifier)
    const digest = await window.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

// Does what it says on the tin
async function buildTokenParams(spClientId: string, spCode: string): Promise<string> {

    // Load verifier string from local storage
    const verifier = localStorage.getItem("verifier")

    // Build URL params
    const params = new URLSearchParams()
    params.append("client_id", spClientId)
    params.append("grant_type", "authorization_code")
    params.append("code", spCode)
    params.append("redirect_uri", "http://localhost:5173/callback")
    params.append("code_verifier", verifier!)

    const { access_token } = await spGetAccessToken(params)
    return access_token
}

// Build JSON string of playlist details
function buildPlaylistParams(vibe: any, genre: string) {
    const params = JSON.stringify({
        name: (vibe + " " + genre).replace(
            /\w\S*/g,
            text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()),
        description: "A playlist of " + genre + " tracks to accompany " + vibe + "-like weather",
        public: false
    })

    return params
}



// =========================================================================================================== API CALLS

// ===================================================================== SPOTIFY

// Make a POST request to Spotify's API token URL
async function spGetAccessToken(params: URLSearchParams): Promise<any> {
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    })

    return await result.json()
}

// Get user's profile
async function spGetProfile(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    })

    return await result.json()
}

// Fetch user's top artists
async function spGetTopArtists(spToken: string, timeframe: string): Promise<any> {
    const result = await fetch(`https://api.spotify.com/v1/me/top/artists?time_range=${timeframe}&limit=10&offset=0`, {
        method: "GET", headers: { Authorization: `Bearer ${spToken}` }
    })

    return await result.json()
}

// Initialise playlist
async function spPostPlaylist(spToken: string, spUID: any, params: any): Promise<any> {
    const result = await fetch(`https://api.spotify.com/v1/users/${spUID}/playlists`, {
        method: "POST", 
        headers: { 
            Authorization: `Bearer ${spToken}`,
            "Content-Type": "application/json" 
        },
        body: params
    })

    return await result.json()
}

// ============================================================== PIRATE WEATHER

// Fetch forecast for given coordinates
async function pwGetWeather(pwKey: string, pwLat: string, pwLong: string): Promise<any> {
    const result = await fetch(`https://api.pirateweather.net/forecast/${pwKey}/${pwLat},${pwLong}`, {
        method: "GET"
    })
    return await result.json()
}



// =================================================================================================== DATA MANIPULATION

async function extractTopGenre(token: string, timeframe: string) {
    let genres: string[] = []
    let genre: string[] = []
    let singleGenre: string [] = []

    // Get top artists JSON
    const topArtists = await spGetTopArtists(token, timeframe)

    // Extract genres from top artists, isolate individual words, collate words into list, I apologise for this
    // I do this to account for minute genre differences that could conceivably be the same high-level genre
    // e.g. "art rock" and "modern rock" could both be "rock"
    // There are probably better ways to do this
    for (let i = 0; i < topArtists.items.length; i++) {
        genre = topArtists.items[i].genres
        for (let j = 0; j < genre.length; j++) {
            singleGenre=genre[j].split(" ")
            for (let g = 0; g < singleGenre.length; g++) {
                genres.push(singleGenre[g])
            }
        }
    }

    genres = genres.flat()
    return (getListMode(genres))[0]
}

// Order list of strings by frequency, remove dupes
function getListMode(list: Array<string>) {
    var frequency = {} 
    list = list.sort()
    list.forEach(function(value){frequency[value] = 0})
    
    var uniques = list.filter(function(value) {
        return ++frequency[value] == 1
    });

    return uniques.sort(function(a, b) {
        return frequency[b] - frequency[a]
    });
}

function getListAvg(list: Array<number>) {
    const sum = list.reduce((a, b) => a + b, 0)
    const avg = sum / list.length
    return avg
}

// Make stats readable
function formatStats(info: any) {
// Get average temperature for upcoming week
    let precipChance: number[] = []
    let tempsMax: number[] = []
    let tempsMin: number[] = []
    let tempsAvg: number[] = []
    for (let i = 0; i < info.data.length; i++) {
        precipChance.push(info.data[i].precipProbability)
        tempsMax.push(info.data[i].apparentTemperatureHigh)
        tempsMin.push(info.data[i].apparentTemperatureLow)
    }
    for (let i = 0; i < tempsMax.length; i++) {
        tempsAvg.push((tempsMax[i] + tempsMin[i]) / 2)
    }

    // Convert F to C and get avg chance of rainfall as a percentage
    const avgTemp: number =+ (((getListAvg(tempsAvg) || 0 )-32)*(5/9)).toFixed(2)
    var avgRainChance: number =+ getListAvg(precipChance).toFixed(2)
    avgRainChance = avgRainChance * 100
    return interpretWeather(avgTemp,avgRainChance)
}

// Build natural-language weather descriptor
// Using seasonal "vibes" as descriptors for now
function interpretWeather(avgTemp: number, avgRainChance: number) {
    let temp = ""
    let rain = ""
    let desc = ""

    // | avgTemp    | avgRainChance | temp  | rain  | desc      |
    // |------------|---------------|-------|-------|-----------|
    // |<15         | >=50          | cold  | wet   | winter    |
    // |<15         | <50           | cold  | dry   | autumn    |
    // |>=15        | >=50          | warm  | wet   | spring    |
    // |>=15        | <50           | warm  | dry   | summer    |

    // I apologise profusely for the following:
    if (avgTemp < 15.0) {
        temp = "cold"
    } else {
        temp = "warm"
    }
    if (avgRainChance < 50) {
        rain = "dry"
    } else {
        rain = "wet"
    }
    if (temp == "cold") {
        if (rain == "wet") {
            desc = "winter"
        } else {
            desc = "autumn"
        }
    } else {
        if (rain == "wet") {
            desc = "spring"
        } else {
            desc = "summer"
        }
    }

    return desc
}



// ========================================================================================================= CALL CHAINS

// Init call chain for Spotify data
async function pullSpotify(clientId: string, code: string, timeframe: string) {
    const accessToken = await buildTokenParams(clientId, code)
    const topGenre = await extractTopGenre(accessToken, timeframe)
    const profile = await spGetProfile(accessToken)
    return [accessToken,topGenre,profile]
}

// Init call chain for weather data
async function pullForecast(pwKey: string) {
    let vibe = getLocationPromise.then(async (location) => {
        const weatherData = await pwGetWeather(pwKey,location.latitude,location.longitude)
        return formatStats(weatherData.daily)
    })
    return vibe
}

async function pullData(pwKey: string, clientId: string, code: string, timeframe: string) {
    const forecast = await pullForecast(pwKey)
    const spotifyData = await pullSpotify(clientId, code, timeframe)
    return [forecast,spotifyData]
}

async function createPlaylist(pwKey: string, clientId: string, code: string, timeframe: string) {
    const pulledData = await pullData(pwKey, clientId, code, timeframe)

    const vibe = pulledData[0]
    const spToken = pulledData[1][0]
    const spGenre = pulledData[1][1]
    const spUID = [pulledData[1][2].id]
    const params = buildPlaylistParams(vibe, spGenre)
    
    spPostPlaylist(spToken, spUID, params)
}

// ================================================================================================================ INIT

// Landing flow
if (!spCode) {
    spRedirectToAuthCodeFlow(spClientId)
}