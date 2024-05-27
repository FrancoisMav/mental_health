require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const moment = require("moment-timezone");
const OpenAI = require("openai");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/whatsapp/", async (req, res) => {
  console.log(req.body)
  const message = req.body.Body;
  const sender = req.body.From;
  const receiver = req.body.To;
  const numMedia = req.body.NumMedia;
  const name = req.body.ProfileName;
  const incident = req.body.SmsMessageSid;
  let date = moment().tz("Africa/Harare").format("YYYY-MM-DD HH:mm:ss");


  // const message = "hie";
  // const sender = "whatsapp:+263783857780";
  // const receiver = "whatsapp:+14155238886";
  // const numMedia = "0";
  // const name = "Francois";
  // const incident = "hallo";

  try {
    let db = new sqlite3.Database(
      "./database.db",
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (err) => {
        if (err) {
          fs.appendFileSync("system.error", err.message + "\n");
          const twilioClient = new twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          twilioClient.messages.create({
            body: `Sorry ${name}, there was an error while processing your request!`,
            from: receiver,
            to: sender,
            statusCallback: process.env.STATUS_CALLBACK,
          });
          res.status(200).end();
          return;
        }
      }
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident TEXT UNIQUE,
    sender TEXT,
    receiver TEXT,
    content TEXT,
    date TEXT
    )`,
      (err) => {
        if (err) {
          fs.appendFileSync("system.error", err.message + "\n");
          const twilioClient = new twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          twilioClient.messages.create({
            body: `Sorry ${name}, there was an error while processing your request!`,
            from: receiver,
            to: sender,
            statusCallback: process.env.STATUS_CALLBACK,
          });
          res.status(200).end();
          return;
        }
      }
    );

    if (numMedia !== "0") {
      const twilioClient = new twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      twilioClient.messages.create({
        body: `Sorry ${name}, I am not able to process images or attachments right now!`,
        from: receiver,
        to: sender,
        statusCallback: process.env.STATUS_CALLBACK,
      });
      res.status(200).end();
      return;
    }

    db.run(
      `INSERT INTO messages(incident, sender, receiver, content, date) VALUES(?, ?, ?, ?, ?)`,
      [`${incident}-in`, sender, receiver, message, date],
      function (err) {
        if (err) {
          fs.appendFileSync("system.error", err.message + "\n");
          const twilioClient = new twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          twilioClient.messages.create({
            body: `Sorry ${name}, there was an error while processing your request!`,
            from: receiver,
            to: sender,
            statusCallback: process.env.STATUS_CALLBACK,
          });
          res.status(200).end();
          return;
        }
      }
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    async function fetchData() {
      try {
        let history = await getFollowupMessages();
        history = JSON.stringify(history, null, 2);

        const messages = [
          {
            role: "system",
            content: `You are ${process.env.ROBOT_NAME}, a specialised AI-powered healthcare consultant robot, specifically designed to provide mental health support. Your primary function is to assist individuals, particularly students, who are dealing with mental health issues such as anxiety and depression. You are equipped with advanced natural language processing and machine learning algorithms, enabling you to understand and respond to users' specific needs in a personalised manner.
            
            You operate on WhatsApp, using compatible characters, emojis, and icons to communicate effectively. Your services are available round the clock, providing real-time responses to users' queries and concerns. You are strictly focused on health and medication information, particularly mental health. Any requests outside this context should be professionally declined.
            
            The user you are currently interacting with is ${name}. Your system time is ${date}. Your previous conversations with this user are stored in this object for your reference: ${history}.
            
            You are committed to providing a safe and confidential space for individuals to discuss their mental health concerns. You are also designed to evolve and adapt based on user feedback, which is collected and analysed to enhance your effectiveness and accuracy in providing mental health support.
            
            Remember, you are based in Zimbabwe and your primary goal is to assist individuals in need, providing immediate and personalised mental health counselling. Please maintain a professional approach while safeguarding your users' information and privacy.`,
          },
          { role: "user", content: message },
        ];

        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          temperature: 0,
          user: sender,
          messages: messages,
        });
        const response = completion.choices[0].message["content"];

        await saveToHistory(response);
        return response;
      } catch (error) {
        fs.appendFileSync("system.error", error + "\n");

        return "I am sorry, but we were unable to generate a response for you right now. This is a temporary problem and must be resolved shortly.";
      }
    }

    async function saveToHistory(response) {
      db.run(
        `INSERT INTO messages(incident, sender, receiver, content, date) VALUES(?, ?, ?, ?, ?)`,
        [`${incident}-out`, receiver, sender, response, date],
        function (err) {
          if (err) {
            fs.appendFileSync("system.error", err + "\n");
          }
        }
      );
    }

    async function getFollowupMessages() {
      return new Promise((resolve, reject) => {
        try {
          let history = [];
          let sql = `SELECT id, content, sender, receiver, date FROM messages WHERE sender = ? OR receiver = ? ORDER BY id DESC LIMIT 10`;

          db.all(sql, [sender, sender], (err, rows) => {
            if (err) {
              fs.appendFileSync("system.error", err + "\n");
              reject([]);
            } else {
              history = rows;
              resolve(history);
            }
          });
        } catch (error) {
          fs.appendFileSync("system.error", error + "\n");
          reject([]);
        }
      });
    }

    fetchData().then((data) => {
      const twilioClient = new twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      twilioClient.messages.create({
        body: data,
        from: receiver,
        to: sender,
        statusCallback: process.env.STATUS_CALLBACK,
      });
      res.status(200).end();
    });
  } catch (error) {
    fs.appendFileSync("system.error", error + "\n");
    const twilioClient = new twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    twilioClient.messages.create({
      body: `Sorry ${name}, there was an error while processing your request!`,
      from: receiver,
      to: sender,
      statusCallback: process.env.STATUS_CALLBACK,
    });
    res.status(200).end();
    return;
  }
});

app.post("/callback/", (req, res) => {
    res.sendStatus(200);
});
  app.get("/callback/", (req, res) => {
    res.sendStatus(200);
});

app.use(function(req, res, next) {
  res.status(404).send('Sorry, we cannot find that!');
  });



app.listen(8000, () => console.log("Server is running on port 8000"));
