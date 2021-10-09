const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const strftime = require("strftime");
const path = require("path");
app.use(express.json());
const databasePath = path.join(__dirname, "twitterClone.db");
let db = null;

const initDbAndStartServer = async () => {
  try {
    db = await open({ filename: databasePath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("server started...");
    });
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
};
initDbAndStartServer();

app.post("/register/", async (request, response) => {
  //console.log("tes");
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username="${username}"`;
  const givenUserData = await db.get(checkUserQuery);
  if (givenUserData === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user(name, username,password, gender)
        VALUES ('${name}', '${username}','${passwordHash}', '${gender}');`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserNameQuery = `SELECT * FROM user WHERE username="${username}"`;
  const userToLogin = await db.get(checkUserNameQuery);
  if (userToLogin === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //check password
    const passwordCheck = await bcrypt.compare(password, userToLogin.password);
    if (passwordCheck === true) {
      const payLoad = { userId: userToLogin.user_id };
      const jwtToken = jwt.sign(payLoad, "secretKey");
      response.send({ jwtToken: jwtToken });
      //console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authorizationControl = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    let jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "secretKey", (error, payLoad) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.userId = payLoad.userId;
          next();
        }
      });
    }
  }
};

app.get(
  "/user/tweets/feed/",
  authorizationControl,
  async (request, response) => {
    const follower_user_id = request["userId"];
    const getFollowersListQuery = `
        SELECT user.username as username,tweet.tweet as tweet,tweet.date_time as dateTime
        FROM follower JOIN tweet ON follower.following_user_id=tweet.user_id 
        JOIN user ON  user.user_id=tweet.user_id  WHERE follower.follower_user_id=${follower_user_id} LIMIT 4 ;`;
    const allDataFollowers = await db.all(getFollowersListQuery);
    response.send(allDataFollowers);
  }
);

app.get("/user/following/", authorizationControl, async (request, response) => {
  const follower_user_id = request["userId"];
  const getFollowersListQuery = `
        SELECT  (user.name) as name
        FROM follower JOIN user ON  follower.following_user_id=user.user_id WHERE follower.follower_user_id=${follower_user_id};`;
  const allDataFollowers = await db.all(getFollowersListQuery);
  response.send(allDataFollowers);
});

app.get("/user/followers/", authorizationControl, async (request, response) => {
  const follower_user_id = request["userId"];
  const getFollowersListQuery = `
        SELECT  (user.name) as name
        FROM follower JOIN user ON  follower.follower_user_id=user.user_id WHERE follower.following_user_id=${follower_user_id};`;
  const allDataFollowers = await db.all(getFollowersListQuery);
  response.send(allDataFollowers);
});

app.get(
  "/tweets/:tweetId/",
  authorizationControl,
  async (request, response) => {
    const { tweetId } = request.params;
    const follower_user_id = request["userId"];
    const tweetsGetFollowersListQuery = `
        SELECT tweet,count(like_id),count(reply.reply),date_time
        FROM( ((follower JOIN tweet ON  follower.following_user_id=tweet.user_id) 
        LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id)
        LEFT JOIN like ON reply.tweet_id=like.tweet_id)
        WHERE (follower.follower_user_id=${follower_user_id} and tweet.tweet_id=${tweetId} )
        GROUP BY reply.reply;`;
    const tweetsAllDataFollowers = await db.all(tweetsGetFollowersListQuery);

    if (tweetsAllDataFollowers.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(tweetsAllDataFollowers);
    }
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authorizationControl,
  async (request, response) => {
    const { tweetId } = request.params;
    const follower_user_id = request["userId"];
    const getFollowerQuery = `
    SELECT DISTINCT (user.name) FROM
    (follower JOIN tweet ON follower.following_user_id=tweet.user_id
    LEFT JOIN like ON like.tweet_id=tweet.tweet_id) as T
    JOIN user on T.user_id=user.user_id
    WHERE follower.follower_user_id=${follower_user_id} and tweet.tweet_id=${tweetId}`;
    const getData = await db.all(getFollowerQuery);
    if (getData.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: getData.map((each) => each.name) });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authorizationControl,
  async (request, response) => {
    const { tweetId } = request.params;
    const follower_user_id = request["userId"];
    const getFollowerQuery = `
    SELECT DISTINCT name,reply FROM
    (follower JOIN tweet ON follower.following_user_id=tweet.user_id
    LEFT JOIN reply ON reply.tweet_id=tweet.tweet_id) as T
    JOIN user on T.user_id=user.user_id
    WHERE follower.follower_user_id=${follower_user_id} and tweet.tweet_id=${tweetId}`;
    const getData = await db.all(getFollowerQuery);
    if (getData.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: getData });
    }
  }
);

//api 9
app.get("/user/tweets/", authorizationControl, async (request, response) => {
  const user_id = request["userId"];
  const getAllByUserQuery = `
  SELECT 
    * 
  FROM 
    tweet 
  INNER JOIN like 
  ON 
    tweet.tweet_id=like.tweet_id
  WHERE 
    tweet.user_id=${user_id};`;
  const getAllTweets = await db.all(getAllByUserQuery);
  console.log(getAllTweets);
  response.send(getAllTweets);
});

//api 10

app.post("/user/tweets/", authorizationControl, async (request, response) => {
  const { tweet } = request.body;
  const user_id = request["userId"];
  const time = strftime("%F %T", new Date());
  const createTweetQuery = `INSERT INTO tweet (tweet,user_id,date_time)
  VALUES ('${tweet}',${user_id},"${time}");`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authorizationControl,
  async (request, response) => {
    const { tweetId } = request.params;
    const user_id = request["userId"];
    const getTweetQuery = `SELECT * FROM tweet
    WHERE user_id=${user_id} and tweet_id=${tweetId};`;

    const data = await db.get(getTweetQuery);

    if (data === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet
    WHERE user_id=${user_id} and tweet_id=${tweetId};`;

      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
