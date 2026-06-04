const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Holiday = require("../models/holiday");

const XLSX = require("xlsx");

const fs = require("fs");

exports.importHolidayExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const workbook = XLSX.readFile(req.file.path);

    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    const holidays = XLSX.utils.sheet_to_json(sheet);

    const created = [];
    const failed = [];

    for (const data of holidays) {
      try {
        let holidayDate;

        // Excel Date Object
        if (data.holidayDate instanceof Date) {
          holidayDate = new Date(
            Date.UTC(
              data.holidayDate.getFullYear(),
              data.holidayDate.getMonth(),
              data.holidayDate.getDate(),
            ),
          );
        }

        // Excel Serial Number
        else if (typeof data.holidayDate === "number") {
          const parsed = XLSX.SSF.parse_date_code(data.holidayDate);

          holidayDate = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        }

        // String Date (26-01-2026 or 26/01/2026)
        else if (typeof data.holidayDate === "string") {
          const dateStr = data.holidayDate.trim();

          let day;
          let month;
          let year;

          if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            [day, month, year] = dateStr.split("-");
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            [day, month, year] = dateStr.split("/");
          } else {
            throw new Error(`Invalid date format: ${dateStr}`);
          }

          holidayDate = new Date(
            Date.UTC(Number(year), Number(month) - 1, Number(day)),
          );
        }

        if (!holidayDate || isNaN(holidayDate.getTime())) {
          failed.push({
            holidayName: data.holidayName,
            reason: "Invalid holiday date",
          });

          continue;
        }

        const exists = await Holiday.findOne({
          holidayName: data.holidayName?.trim(),
          holidayDate,
        });

        if (exists) {
          failed.push({
            holidayName: data.holidayName,
            reason: "Holiday already exists",
          });

          continue;
        }

        const holiday = await Holiday.create({
          holidayName: data.holidayName?.trim(),
          holidayDate,
          holidayType: data.holidayType?.trim(),
          description: data.description?.trim() || "",
          isActive: true,

          applicableEmployeeCategories: data.applicableEmployeeCategories
            ? data.applicableEmployeeCategories
                .split(",")
                .map((category) => category.trim())
            : [],
        });

        created.push(holiday);
      } catch (error) {
        failed.push({
          holidayName: data.holidayName || "Unknown",
          reason: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      createdCount: created.length,
      failedCount: failed.length,
      failed,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.addHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.create(req.body);

    res.status(201).json({
      success: true,
      holiday,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.getHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({
      holidayDate: 1,
    });

    res.status(200).json(holidays);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    res.status(200).json(holiday);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.updateHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    res.status(200).json({
      success: true,
      holiday,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Holiday deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
