const expressApp = require('express');
const passportAuth = require('passport');
const GitHubOauth = require('passport-github2').Strategy;
const GoogleOauth = require('passport-google-oauth20').Strategy;
const expressSession = require('express-session');
const axiosClient = require('axios');
const { google } = require('googleapis');
const pathUtil = require('path'); // For absolute paths
require('dotenv').config();

const app = expressApp();

// URL for subscription prompt
const subscribeLink = 'https://www.youtube.com/@BYTE-mait?sub_confirmation=1';

// Setting up sessions
app.use(expressSession({ 
    secret: process.env.SESSION_SECRET, 
    resave: false, 
    saveUninitialized: true 
}));
app.use(passportAuth.initialize());
app.use(passportAuth.session());

// GitHub OAuth configuration
passportAuth.use(new GitHubOauth({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/github/callback"
}, async function(token, tokenSecret, userProfile, done) {
    // Verifying if user follows "bytemait"
    console.log('Access Token:', token);
    console.log('User Profile:', userProfile);

    const githubApiEndpoint = `https://api.github.com/user/${userProfile.username}/following/bytemait`;

    axiosClient.get(githubApiEndpoint, {
        headers: {
            'Authorization': `token ${token}` // Use the provided access token
        }
    }).then(response => {
        if (response.status === 204) {
            // User follows 'bytemait'
            return done(null, userProfile);
        } else {
            return done(null, false, { message: 'Please follow bytemait on GitHub.' });
        }
    }).catch(err => {
        console.error('Error fetching from GitHub API:', err.response?.data || err.message);
        return done(err);
    });
}));

// YouTube OAuth configuration
passportAuth.use(new GoogleOauth({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback",
    scope: ['https://www.googleapis.com/auth/youtube.readonly', 'profile', 'email']
}, async function(token, tokenSecret, userProfile, done) {
    console.log('Access Token:', token);
    console.log('User Profile:', userProfile);

    const oauthClient = new google.auth.OAuth2(); // Create OAuth2 client
    oauthClient.setCredentials({ access_token: token }); // Use the access token

    const youtubeApi = google.youtube({
        version: 'v3',
        auth: oauthClient // Pass OAuth2 client
    });

    try {
        const subscriptionResponse = await youtubeApi.subscriptions.list({
            part: 'snippet',
            mine: true,
            forChannelId: 'UCwk8Ji_KtnPLm2rj5XkuUZQ', // Replace with the channel ID
        });

        console.log('Subscription Response:', subscriptionResponse.data);

        if (subscriptionResponse.data.items.length > 0) {
            // User is subscribed
            return done(null, { userProfile, isSubscribed: true });
        } else {
            // User is not subscribed
            return done(null, { userProfile, isSubscribed: false });
        }
    } catch (err) {
        console.error('Error with YouTube API:', err);
        return done(err);
    }
}));

// Serialize and deserialize user for session handling
passportAuth.serializeUser(function(user, done) {
    done(null, user);
});

passportAuth.deserializeUser(function(obj, done) {
    done(null, obj);
});

// GitHub OAuth routes
app.get('/auth/github', passportAuth.authenticate('github', { scope: ['user:follow'] }));

app.get('/auth/github/callback', 
    passportAuth.authenticate('github', { failureRedirect: '/login' }),
    function(req, res) {
        res.redirect('/protected');
    }
);

// YouTube OAuth routes
app.get('/auth/google', passportAuth.authenticate('google', { scope: ['https://www.googleapis.com/auth/youtube.readonly', 'profile', 'email'] }));

app.get('/auth/google/callback', 
    passportAuth.authenticate('google', { failureRedirect: '/login' }),
    function(req, res) {
        if (req.user.isSubscribed) {
            res.redirect('/protected');
        } else {
            res.redirect(subscribeLink); // Redirect to subscription prompt
        }
    }
);

// Protected page route
app.get('/protected', ensureAuthenticated, function(req, res) {
    const protectedPagePath = pathUtil.resolve('project', 'views', 'protected.html');
    res.sendFile(protectedPagePath);
});

// Login page route
app.get('/login', (req, res) => {
    const loginPagePath = pathUtil.resolve('project', 'views', 'login.html');
    res.sendFile(loginPagePath);
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login');
}

// Root URL route
app.get('/', (req, res) => {
    res.redirect('/login'); // Redirect to login page
});

// Server start
app.listen(3000, () => {
    console.log('Server is up and running at http://localhost:3000');
});