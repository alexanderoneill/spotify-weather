// ============================================================================================== CONSTANTS & EXTENSIONS

// Define some constants (App Client ID, URL params parsed from URL,
// auth code parsed from params)
const spotifyClientId = "b5af9f02259b418cb6e80425b55a6226";
const params = new URLSearchParams(window.location.search);
const spotifyCode = params.get("code");
const default_timeframe = "medium_term";
const timeframeSelector = document.getElementById("timeframe")
timeframeSelector?.addEventListener("change", selectListener);

if (!spotifyCode) {
    spotifyRedirectToAuthCodeFlow(spotifyClientId);
} else {
    spotifyPullStatsAndPopulate(spotifyClientId, spotifyCode, default_timeframe);
}

// ======================================================================================================= AUTHORISATION

// Begin auth flow, accepts app client ID.
export async function spotifyRedirectToAuthCodeFlow(spotifyClientId: string) {

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

// Fetch profile data, invoked after getting accessToken
// So /v1/me will direct to user's profile
async function fetchProfile(spotifyToken: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${spotifyToken}` }
    });

    return await result.json();
}

// Fetch user's recently played tracks
async function fetchTopTracks(spotifyToken: string, timeframe: string): Promise<any> {
    const result = await fetch(`https://api.spotify.com/v1/me/top/tracks?time_range=${timeframe}&limit=5&offset=0`, {
        method: "GET", headers: { Authorization: `Bearer ${spotifyToken}` }
    });

    return await result.json();
}

// Fetch user's top artists, find most common genres among these
async function fetchTopArtists(spotifyToken: string, timeframe: string): Promise<any> {
    const result = await fetch(`https://api.spotify.com/v1/me/top/artists?time_range=${timeframe}&limit=10&offset=0`, {
        method: "GET", headers: { Authorization: `Bearer ${spotifyToken}` }
    });

    return await result.json();
}

// ============================================================== PIRATE WEATHER

async function pwFetchWeather(pwKey: string, pwLat: string, pwLong: string) {
    const result = await fetch(`https://api.pirateweather.net/forecast/${pwKey}/${pwLat},${pwLong}`, {
        method: "GET", headers: { Authorization: `Bearer ${pwKey}` }
    });

    console.log(result);
}



// =================================================================================================== DATA MANIPULATION

async function extractTopGenre(token: string, timeframe: string) {
    var genres = new Array<string>;
    var frequency = {};

    // Get top artists JSON
    const topArtists = await fetchTopArtists(token, timeframe);

    // Extract and flatten genres from top artists
    for (let i = 0; i < topArtists.items.length; i++) {
        genres.push(topArtists.items[i].genres);
    }
    genres = genres.flat();

    // Order genres by frequency, remove dupes
    genres = genres.sort();
    genres.forEach(function(value) { frequency[value] = 0; });
    var uniques = genres.filter(function(value) {
        return ++frequency[value] == 1;
    });

    return uniques.sort(function(a, b) {
        return frequency[b] - frequency[a];
    });
}



// ========================================================================================================== UI DRAWING

export async function spotifyPullStatsAndPopulate(clientId: string, code: string, timeframe: string) {
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);
    const topTracks = await fetchTopTracks(accessToken, timeframe);
    const topGenre = await extractTopGenre(accessToken, timeframe);
    populateUI(profile, topTracks, topGenre);
}

function selectListener(selectElement: HTMLElement) {
    spotifyPullStatsAndPopulate(spotifyClientId, spotifyCode, selectElement.target.value)
}

// Populate html spans by element ID
// Resize profile image
function populateUI(profile: any, topTracks: any, topGenre: any) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(75, 75);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar")!.appendChild(profileImage);
    }
    document.getElementById("topTracks1")!.innerText = topTracks.items[0].name;
    document.getElementById("topTracks2")!.innerText = topTracks.items[1].name;
    document.getElementById("topTracks3")!.innerText = topTracks.items[2].name;
    document.getElementById("topTracks4")!.innerText = topTracks.items[3].name;
    document.getElementById("topTracks5")!.innerText = topTracks.items[4].name;

    document.getElementById("topTracks1Artist")!.innerText = topTracks.items[0].artists[0].name;
    document.getElementById("topTracks2Artist")!.innerText = topTracks.items[1].artists[0].name;
    document.getElementById("topTracks3Artist")!.innerText = topTracks.items[2].artists[0].name;
    document.getElementById("topTracks4Artist")!.innerText = topTracks.items[3].artists[0].name;
    document.getElementById("topTracks5Artist")!.innerText = topTracks.items[4].artists[0].name;

    document.getElementById("topGenres1")!.innerText = topGenre[0];
    document.getElementById("topGenres2")!.innerText = topGenre[1];
    document.getElementById("topGenres3")!.innerText = topGenre[2];
    document.getElementById("topGenres4")!.innerText = topGenre[3];
    document.getElementById("topGenres5")!.innerText = topGenre[4];
}