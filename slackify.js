var SLACK_TOKEN = process.env.SLACK_TOKEN 
var SPOTIFY_ID = process.env.SPOTIFY_ID
var SPOTIFY_SECRET = process.env.SPOTIFY_SECRET
var SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI
var SPOTIFY_USERNAME = process.env.SPOTIFY_USERNAME
var SPOTIFY_PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID

var slackbot = require('node-slackbot');
var bot = new slackbot(SLACK_TOKEN);
 
var MetaInspector = require('node-metainspector');

var itunes = require('itunes-search')

var SpotifyWebApi = require('spotify-web-api-node');

var spotifyApi = new SpotifyWebApi({
  clientId : SPOTIFY_ID,
  clientSecret : SPOTIFY_SECRET//,
 // redirectUri : SPOTIFY_REDIRECT_URI
});

var spotifyUri = require('spotify-uri');
var parsed, uri;

var getUrls = require('get-urls');

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = SPOTIFY_ID; // Your client id
var client_secret = SPOTIFY_SECRET; // Your secret
var redirect_uri = SPOTIFY_REDIRECT_URI; // Your redirect uri

var access_token;

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        access_token = body.access_token,
            refresh_token = body.refresh_token;
		spotifyApi.setAccessToken(access_token);
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
	  spotifyApi.setAccessToken(access_token);
       
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);

function addTrack(id) 
{
  spotifyApi.addTracksToPlaylist(SPOTIFY_USERNAME, SPOTIFY_PLAYLIST_ID, ["spotify:" + "track" + ":" + id])
    .then(function(data) {
      console.log('Added tracks to playlist!');
    }, function(err) {
      console.log('Something went wrong!', err);
    });		
}

function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}

bot.use(function(message, cb) {
  if ('message' == message.type && message.text) {
    
	var urls = getUrls(message.text, {stripWWW: false});
	var trackID;
	var trackName;
	
	for (var i = 0; i < urls.length; i++) {
		
		if(urls[i].indexOf("spotify.com") > -1) {
			
			console.log("it's a spotify url");
			urls[i] = urls[i].slice(0, -3);
			parsed = spotifyUri.parse(urls[i]);
			trackID = parsed.id;
			addTrack(trackID);
			
		} else if(urls[i].indexOf("youtube.com") > -1 || urls[i].indexOf("youtu.be") > -1) {			
			console.log("it's youtube");
			
			var client = new MetaInspector(urls[i], {maxRedirects: 10 });
			client.on("fetch", function(){   	
				trackName = client.ogTitle;	
				trackName = trackName.replace('Official Video', '');
				trackName = trackName.replace('Video', '');
				trackName = trackName.replace('Lyrics', '');
				trackName = trackName.replace('official video', '');
				trackName = trackName.replace('video', '');
				trackName = trackName.replace('lyrics', '');
					
				console.log("going to search spotify for youtube song " + trackName);		
				spotifyApi.searchTracks(trackName)
					    	.then(function(data) {
 							   console.log(data.body);
							   addTrack(data.body.tracks.items[0].id);
							}, function(err) {
						      console.error(err);
						    });
			
			});
 
			client.on("error", function(err){
				console.log("error!")
				console.log(err);
			});
 
			client.fetch();
			
		} else if(urls[i].indexOf("apple.com") > -1 || 
				urls[i].indexOf("itunes.com") > -1 || 
				urls[i].indexOf("itun.es") > -1) {			
				
					console.log("it's itunes. TBD;")
 
		} else {
			console.log("adding an unknown source")
			
			var client = new MetaInspector(urls[i], {maxRedirects: 10 });
			client.on("fetch", function(){   	
				trackName = client.title;
				console.log("unknown title:" + trackName);				
				spotifyApi.searchTracks(trackName)
					    	.then(function(data) {
								console.log("searching for spotify?")
							   console.log(data.body);
							   addTrack(data.body.tracks.items[0].id);
							   
							}, function(err) {
						      console.error(err);
						    });
			
			});
 
			client.on("error", function(err){
				console.log("error!")
				console.log(err);
			});
 
			client.fetch();
			
		}
	}	
  }
  cb();
});

bot.connect();