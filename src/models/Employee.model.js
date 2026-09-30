/* Employee — Team members (login, salary/cost rate, avatar)
   Collection: "employees"

   Fields mirror the shapes the business engine (shared/*.js) writes. The
   schema is "strict: false" because the engine may add fields over time;
   documents are written through the store service, which keeps them exactly
   as the engine produced them. */
'use strict';
const { Schema, model } = require('mongoose');

const employeeSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: String,
    role: String,
    deptId: Number,
    email: String,
    phone: String,
    managerId: Number,
    accessLevel: String,
    attendanceStatus: String,
    score: Number,
    joinedAt: String,
    avatarInitials: String,
    avatarBg: String,
    avatarFg: String,
    color: String,
    canLogin: Boolean,
    costPerHourPaise: Number,
    billRatePaise: Number,
    hoursPerDay: Number,
    monthlySalaryPaise: Number,
    username: String,
    passHash: String,
    mustChangePass: Boolean,
    address: String,
    active: Boolean,
    _ord: { type: Number, index: true }   // position in the list (the app keeps lists ordered)
  },
  { collection: 'employees', strict: false, versionKey: false, minimize: false }
);

module.exports = model('Employee', employeeSchema);
