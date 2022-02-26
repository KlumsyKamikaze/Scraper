const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    roll: { type: String, unique: true, required: true },
    gradeInfo: [
      {
        semester: { type: String },
        CGPA: { type: String },
        courses: [
          {
            code: { type: String },
            name: { type: String },
            credits: { type: String },
            grade: { type: String },
          },
        ],
      },
    ],

    creationTime: { type: Number, default: Date.now },
    lastUpdated: { type: Number, default: Date.now },
  },
  { excludeIndexes: true, autoIndex: false }
);

studentSchema.pre("save", function save(next) {
  const user = this;
  user.lastUpdated = Date.now();
  next();
});

studentSchema.pre("updateOne", function updateOne(next) {
  const user = this;
  user.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model("Student", studentSchema);
