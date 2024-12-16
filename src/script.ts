// ============================================================================== CONSTANTS, DEFINITIONS, AND EXTENSIONS

// Define globals
const spotifyClientId = "b5af9f02259b418cb6e80425b55a6226";
const pwKey = "Qx1wavydstRGvUBn3EkZz6D3RvrX2Ajk";
const params = new URLSearchParams(window.location.search);
const spotifyCode = params.get("code");
const default_timeframe = "medium_term";

// Used specifically to avoid having to use a global for user coords
let getLocationPromise = new Promise((resolve, reject) => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            let lat = position.coords.latitude;
            let long = position.coords.longitude;

            resolve({latitude: lat,
                longitude: long});
        })
    } else {
        reject("Location services are not supported by this browser");
    }
})

if (!spotifyCode) {
    spotifyRedirectToAuthCodeFlow(spotifyClientId);
} else {
    spotifyPullStats(spotifyClientId, spotifyCode, default_timeframe);
    pwPullForecast(pwKey);
}

// ======================================================================================================= AUTHORISATION

// Begin auth flow, accepts app client ID.
async function spotifyRedirectToAuthCodeFlow(spotifyClientId: string) {

    // Define 128-char verifier and invoke code challenge with this verifier
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    // Save verifier string to local storage
    localStorage.setItem("verifier", verifier);

    // Build URL params
    const params = new URLSearchParams();
    params.append("client_id", spotifyClientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-top-read");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    // Return Spotify Auth URL with appended URL params
    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Generate a random string of alphanumeric characters of a given length
function generateCodeVerifier(length: number) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Encode verifier string and hash it with SHA-256
// Return b64 representation of digest (hash)
async function generateCodeChallenge(codeVerifier: string) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Does what it says on the tin
async function getAccessToken(spotifyClientId: string, spotifyCode: string): Promise<string> {

    // Load verifier string from local storage
    const verifier = localStorage.getItem("verifier");

    // Build URL params
    const params = new URLSearchParams();
    params.append("client_id", spotifyClientId);
    params.append("grant_type", "authorization_code");
    params.append("code", spotifyCode);
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("code_verifier", verifier!);

    // Make a POST request to Spotify's API token URL using the previously
    // built params, and assign result of fetch to const "result"
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });

    // Assign JSON of result const to access token and return
    const { access_token } = await result.json();
    return access_token;
}



// =========================================================================================================== API CALLS

// ===================================================================== SPOTIFY

// Fetch user's top artists, find most common genres among these
async function fetchTopArtists(spotifyToken: string, timeframe: string): Promise<any> {
    const result = await fetch(`https://api.spotify.com/v1/me/top/artists?time_range=${timeframe}&limit=10&offset=0`, {
        method: "GET", headers: { Authorization: `Bearer ${spotifyToken}` }
    });

    return await result.json();
}

// ============================================================== PIRATE WEATHER

// Fetch forecast for given coordinates
async function pwFetchWeather(pwKey: string, pwLat: string, pwLong: string): Promise<any> {
    const result = await fetch(`https://api.pirateweather.net/forecast/${pwKey}/${pwLat},${pwLong}`, {
        method: "GET"
    });
    return await result.json()
}



// =================================================================================================== DATA MANIPULATION

async function extractTopGenre(token: string, timeframe: string) {
    let genres: string[] = []

    // Get top artists JSON
    const topArtists = await fetchTopArtists(token, timeframe);

    // Extract and flatten genres from top artists
    for (let i = 0; i < topArtists.items.length; i++) {
        genres.push(topArtists.items[i].genres);
    }
    
    genres = genres.flat();
    return getListMode(genres);
}

// Order list of strings by frequency, remove dupes
function getListMode(list: Array<string>) {
    var frequency = {}; 
    list = list.sort();
    list.forEach(function(value) { frequency[value] = 0; });
    
    var uniques = list.filter(function(value) {
        return ++frequency[value] == 1;
    });

    return uniques.sort(function(a, b) {
        return frequency[b] - frequency[a];
    });
}

function getListAvg(list: Array<number>) {
    const sum = list.reduce((a, b) => a + b, 0);
    const avg = sum / list.length;
    return avg;
}

// Make stats readable
function formatStats(source: string, info: any) {
    if (source == "music") {
        console.log("6 MONTH TOP GENRES")
        console.log(info.slice(0, 3));
    } else {
        // Get average temperature for upcoming week
        let precipChance: number[] = [];
        let tempsMax: number[] = [];
        let tempsMin: number[] = [];
        let tempsAvg: number[] = [];
        for (let i = 0; i < info.data.length; i++) {
            precipChance.push(info.data[i].precipProbability);
            tempsMax.push(info.data[i].apparentTemperatureHigh);
            tempsMin.push(info.data[i].apparentTemperatureLow);
        }
        for (let i = 0; i < tempsMax.length; i++) {
            tempsAvg.push((tempsMax[i] + tempsMin[i]) / 2)
        }
        const avgTemp: number =+ (((getListAvg(tempsAvg) || 0 )-32)*(5/9)).toFixed(2);
        var avgPrec: number =+ getListAvg(precipChance).toFixed(2);
        avgPrec = avgPrec * 100;
        console.log("UPCOMING WEEK AVG TEMP(C) / CHANCE OF RAIN(%)")
        console.log(avgTemp);
        console.log(avgPrec);
    }
}



// ========================================================================================================== UI DRAWING

// Init call chain for Spotify data
async function spotifyPullStats(clientId: string, code: string, timeframe: string) {
    const accessToken = await getAccessToken(clientId, code);
    const topGenre = await extractTopGenre(accessToken, timeframe);
    formatStats("music",topGenre);
}

// Init call chain for weather data
async function pwPullForecast(pwKey: string) {
    getLocationPromise.then(async (location) => {
        const weatherData = await pwFetchWeather(pwKey,location.latitude,location.longitude);
        formatStats("weather",weatherData.daily);
    })
}