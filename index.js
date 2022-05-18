const puppeteer = require("puppeteer");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const Student = require("./model");
const nodemailer = require("nodemailer");
require("dotenv").config();

async function scrapper(username, password) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"
  );
  await page.goto("https://www.iitm.ac.in/viewgrades/");
  await page.type('input[name="rollno"]', username);
  await page.type('input[name="pwd"]', password);
  await page.click('input[name="submit"]');
  page.on("console", (log) => console[log._type](log._text));
  const f = await page.$('frame[src="studopts2.php"]');
  if (!f) {
    throw new Error("The credentials are invalid");
  }

  const m = await f.contentFrame();

  const table = await m.$("table[border='1'][align='center'] tbody");

  const sanitizedRows = await table.evaluate((tempTable) => {
    const rows = Array.from(tempTable.childNodes);
    return rows.reduce(
      ({ prevData, currentSem }, row) => {
        const th = row.querySelector("th");
        const td8 = row.querySelector("td[colspan='8']");
        const td2 = row.querySelector("td[colspan='2']");
        if (th) {
          console.log("Invalid element found");
          return { prevData, currentSem };
        }
        if (td8) {
          const semester = row.textContent.split("(")[0].trim();
          prevData.push({ semester, courses: [] });
          return { prevData, currentSem };
        }
        if (td2) {
          console.log("td2 found");
          const CGPA = Array.from(row.querySelectorAll("td"))
            .find((entries) => entries.textContent.includes("CGPA"))
            .textContent.split(":")[1];
          const ungradedCourses = prevData[currentSem].courses.filter(
            ({ grade }) => grade === " "
          ).length;
          prevData[currentSem] = {
            ...prevData[currentSem],
            CGPA,
            ungradedCourses,
          };
          console.log(CGPA);
          currentSem++;
          return { prevData, currentSem };
        }
        const entries = Array.from(row.querySelectorAll("td"));
        // console.log("entries:" + entries);
        prevData[currentSem].courses.push({
          code: entries[1].textContent,
          name: entries[2].textContent,
          credits: entries[4].textContent,
          grade: entries[5].textContent || "-",
        });
        return { prevData, currentSem };
      },
      { prevData: [], currentSem: 0 }
    ).prevData;
  });
  await browser.close();
  return sanitizedRows;
}
const connectToMongoDB = () => {
  mongoose.connect(
    process.env.NODE_ENV === "production"
      ? process.env.MONGO_DB_URI
      : "mongodb://localhost:27017/scraper",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoCreate: true,
    }
  );
  mongoose.connection.once("open", () => {
    console.log("MongoDB database connection established successfully");
  });
  mongoose.connection.on("error", (err) => {
    console.error(err);
    console.info(
      "MongoDB connection error. Please make sure MongoDB is running."
    );
    process.exit();
  });
};
const tableConstructor = (updatedCourses) => {
  let message =
    '<table style="border: 1px solid #333;">' +
    "<thead>" +
    "<th> Course Name </th>" +
    "<th> Grade</th>" +
    "</thead>";

  return updatedCourses.reduce((prevValue, currentValue) => {
    return (message +=
      "<tr>" +
      "<td>" +
      currentValue.name +
      "</td>" +
      "<td>" +
      currentValue.grade +
      "</td>" +
      "</tr>");
  }, message);
};
const sendEmail = async (message) => {
  // const { from, recipients, subject, message } = mailObj;

  try {
    // Create a transporter
    let transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      auth: {
        user: "ishaan@spysoft.com",
        pass: process.env.SMTP_KEY,
      },
    });

    // send mail with defined transport object
    let mailStatus = await transporter.sendMail({
      from: "ishaan@spysoft.com", // sender address
      to: ["ishaan@spysoft.com"], // list of recipients
      subject: "Grades Declared", // Subject line
      html: message,
    });

    console.log(`Message sent: ${mailStatus.messageId}`);
    return `Message sent: ${mailStatus.messageId}`;
  } catch (error) {
    console.error(error);
    throw new Error(
      `Something went wrong in the sendmail method. Error: ${error.message}`
    );
  }
};

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  cors({
    credentials: true,
    origin: [/https?:\/\/localhost:\d{4}/],
  })
);

connectToMongoDB();
app.listen(process.env.PORT || 5200, () => console.log("Server ready"));

app.post("/", async (req, res) => {
  try {
    console.log(`body:${req.body}`);
    const { username, password } = req.body;
    const data = await scrapper(username, password);
    const doc = await Student.findOneAndUpdate(
      { roll: username },
      { $set: { gradeInfo: data } },
      { upsert: true, new: true }
    );
    return res.status(200).send(data);
  } catch (error) {
    console.log(error);
    if (error.message === "The credentials are invalid") {
      return res.status(400).send("The credentials are invalid");
    }
    if (
      error.message ===
      "Execution context was destroyed, most likely because of a navigation."
    ) {
      return res.status(400).send("Please try logging again");
    }
    return res.status(500).send("An error occured");
  }
});

app.get("/", async (req, res) => {
  return res.status(200).send("Hello there");
});

// let previouslyFetchedData = [
//   {
//     semester: "First Semester",
//     courses: [
//       {
//         code: "GN1101",
//         name: "Life Skills 1",
//         credits: "0",
//         grade: " ",
//       },
//       {
//         code: "ID1200 ",
//         name: "Ecology and Environment",
//         credits: "0",
//         grade: "P",
//       },
//       {
//         code: "MA1101",
//         name: "Functions of Several Variables",
//         credits: "10",
//         grade: "C",
//       },
//       {
//         code: "PH1010",
//         name: "Physics I",
//         credits: "10",
//         grade: "A",
//       },
//     ],
//     CGPA: "8",
//   },
//   {
//     semester: "Second Semester",
//     courses: [
//       {
//         code: "BT1000",
//         name: "Introduction to Biological Sciences & Engineering",
//         credits: "9",
//         grade: "A",
//       },
//       {
//         code: "BT1020",
//         name: "Material and Energy Balances",
//         credits: "11",
//         grade: "A",
//       },
//       {
//         code: "CH1010",
//         name: "Introduction to Chemical Engineering",
//         credits: "12",
//         grade: "S",
//       },
//       {
//         code: "CY1001 ",
//         name: "Chemistry: Structure, Bonding & Reactivity",
//         credits: "10",
//         grade: "B",
//       },
//       {
//         code: "CY1051",
//         name: "Chemistry II",
//         credits: "9",
//         grade: "B",
//       },
//       {
//         code: "EE1101#",
//         name: "Signals and Systems",
//         credits: "10",
//         grade: "B",
//       },
//       {
//         code: "GN1102",
//         name: "Life Skills 2",
//         credits: "0",
//         grade: "P",
//       },
//       {
//         code: "MA1102",
//         name: "Series and Matrices",
//         credits: "10",
//         grade: "C",
//       },
//       {
//         code: "PH1020",
//         name: "Physics II",
//         credits: "10",
//         grade: "A",
//       },
//     ],
//     CGPA: "8.44",
//   },
//   {
//     semester: "Summer",
//     courses: [
//       {
//         code: "PH1030 ",
//         name: "Physics Laboratory I",
//         credits: "4",
//         grade: "A",
//       },
//     ],
//     CGPA: "8.46",
//   },
//   {
//     semester: "Third Semester",
//     courses: [
//       {
//         code: "AM1100 ",
//         name: "Engineering Mechanics",
//         credits: "10",
//         grade: "S",
//       },
//       {
//         code: "BT2010 ",
//         name: "Microbiology",
//         credits: "9",
//         grade: "A",
//       },
//       {
//         code: "BT2030",
//         name: "Biochemistry",
//         credits: "12",
//         grade: "B",
//       },
//       {
//         code: "HS3420 ",
//         name: "China in Contemporary Global Politics",
//         credits: "9",
//         grade: "A",
//       },
//       {
//         code: "ID5200",
//         name: "Introduction of Biomimicry",
//         credits: "9",
//         grade: "S",
//       },
//       {
//         code: "MA2040",
//         name: "Probability, Statistics and Stochastic Process",
//         credits: "9",
//         grade: " ",
//       },
//     ],
//     CGPA: "8.64",
//   },
//   {
//     semester: "Fourth Semester",
//     courses: [
//       {
//         code: "BT2020",
//         name: "Numerical methods for biology",
//         credits: "11",
//         grade: " ",
//       },
//       {
//         code: "BT2022",
//         name: "Biostatistics",
//         credits: "10",
//         grade: " ",
//       },
//       {
//         code: "BT2041",
//         name: "Biological Rate Processes",
//         credits: "11",
//         grade: " ",
//       },
//       {
//         code: "BT2061",
//         name: "Biochemical Thermodynamics",
//         credits: "11",
//         grade: " ",
//       },
//       {
//         code: "BT2111",
//         name: "Microbiology and Biochemistry Lab",
//         credits: "8",
//         grade: " ",
//       },
//       {
//         code: "CY1002",
//         name: "Chemistry Lab I ",
//         credits: "3",
//         grade: "B",
//       },
//       {
//         code: "HS3002B",
//         name: "Principles of Economics",
//         credits: "9",
//         grade: " ",
//       },
//       {
//         code: "ME1480",
//         name: "Engineering Drawing",
//         credits: "7",
//         grade: " ",
//       },
//     ],
//     CGPA: "8.63",
//   },
// ];

let previouslyFetchedData = [];

setInterval(async () => {
  try {
    console.log("code run");
    const freshFetchedData = await scrapper(
      process.env.USER_NAME,
      process.env.PASSWORD
    );
    console.log(freshFetchedData);
    const updatedCourses =
      previouslyFetchedData.length !== 0
        ? freshFetchedData
            .map((semester, semesterIndex) => {
              return semester.courses.filter((course, courseIndex) => {
                return (
                  course.grade !== " " &&
                  previouslyFetchedData[semesterIndex].courses[courseIndex]
                    .grade === " "
                );
              });
            })
            .filter((semester) => semester.length !== 0)
            .reduce((prevValue, currentValue) => {
              return [...prevValue, ...currentValue];
            }, [])
        : [];
    if (updatedCourses.length > 0) {
      sendEmail(tableConstructor(updatedCourses));
    }
    previouslyFetchedData = freshFetchedData;
  } catch (error) {
    if (
      error.message ===
      "Execution context was destroyed, most likely because of a navigation."
    )
      return console.log(
        "Execution context was destroyed, most likely because of a navigation."
      );
    console.log(error);
  }
}, 60000);
