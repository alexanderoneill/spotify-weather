// Define some constants (App Client ID, URL params parsed from URL,
// auth code parsed from params)
const clientId = "b5af9f02259b418cb6e80425b55a6226";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

// Prevent redirect loop
// If no code exists (i.e. if user hasn't authed) 
if (!code) {

    // start auth flow
    redirectToAuthCodeFlow(clientId);
} else {

    // Else populate the UI with profile details (fetchProfile)
    // using access token retrieved by getAccessToken 
    // (which uses our application clientId and the user auth code)
    const accessToken = await getAccessToken(clientId, code);
    const profile = await fetchProfile(accessToken);
    populateUI(profile);
}

// Begin auth flow, accepts app client ID.
export async function redirectToAuthCodeFlow(clientId: string) {

    // Define 128-char verifier and invoke code challenge with this verifier
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    // Save verifier string to local storage
    localStorage.setItem("verifier", verifier);

    // Build URL params
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:5173/callback");
    params.append("scope", "user-read-private user-read-email");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    // Return Spotify Auth URL with appended URL params
    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Generate a random string of alphanumeric characters of a given length
function generateCodeVerifier(length: number) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

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
export async function getAccessToken(clientId: string, code: string): Promise<string> {

    // Load verifier string from local storage
    const verifier = localStorage.getItem("verifier");

    // Build URL params
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
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

async function fetchProfile(token: string): Promise<any> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

function populateUI(profile: any) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar")!.appendChild(profileImage);
    }
    document.getElementById("id")!.innerText = profile.id;
    document.getElementById("email")!.innerText = profile.email;
    document.getElementById("uri")!.innerText = profile.uri;
    document.getElementById("uri")!.setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url")!.innerText = profile.href;
    document.getElementById("url")!.setAttribute("href", profile.href);
    document.getElementById("imgUrl")!.innerText = profile.images[0]?.url ?? '(no profile image)';
}