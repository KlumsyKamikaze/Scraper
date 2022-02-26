const puppeteer = require("puppeteer");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const Student = require("./model");

async function scrapper(username, password) {
  const browser = await puppeteer.launch({
    headless: true,
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
          CGPA = Array.from(row.querySelectorAll("td"))
            .find((entries) => entries.textContent.includes("CGPA"))
            .textContent.split(":")[1];
          prevData[currentSem].CGPA = CGPA;
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
  mongoose.connect("mongodb://localhost:27017/scraper", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    autoCreate: true,
  });
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

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  cors({
    credentials: true,
    origin: [/https?:\/\/localhost:\d{4}/],
  })
);

connectToMongoDB();
app.listen(5200, () => console.log("Server ready"));

app.post("/", async (req, res) => {
  try {
    console.log(req.body);
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
