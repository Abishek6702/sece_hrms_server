const Event = require("../models/Event.js");

require("dotenv").config();
const mongoose = require("mongoose");

exports.requestMediaStaffChange = async (req, res) => {
  try {
    const { id } = req.params;

    const { mediaType, requestedStaff, reason } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    if (!mediaType || !["poster", "video"].includes(mediaType)) {
      return res.status(400).json({
        message: "Valid mediaType is required",
      });
    }

    event.mediaRequirementDetails.mediaRequirements.forEach((media) => {
      media[mediaType].staffChangeRequest = {
        requested: true,

        requestedStaff,

        staffChangeStatus: "Pending",

        staffChangeReason: reason,

        rejectReason: "",

        approvedAt: null,
      };
    });

    await event.save();

    res.status(200).json({
      message: `${mediaType} staff change requested successfully`,
      data: event,
    });
  } catch (error) {
    console.error("Staff change request error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.staffChangeAction = async (req, res) => {
  try {

    const { mediaType, action, rejectReason } = req.body;

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        message: "Event not found"
      });
    }

    if (!["poster", "video"].includes(mediaType)) {
      return res.status(400).json({
        message: "Valid mediaType required"
      });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action"
      });
    }

    event.mediaRequirementDetails.mediaRequirements.forEach(
      (media) => {

        const request =
          media[mediaType].staffChangeRequest;

        if (!request?.requested) {
          return;
        }

        // APPROVE
        if (action === "approve") {

          media[mediaType].staff =
            request.requestedStaff;

          request.staffChangeStatus = "Approved";

          request.approvedAt = new Date();
        }

        // REJECT
        if (action === "reject") {

          request.staffChangeStatus = "Rejected";

          request.rejectReason =
            rejectReason || "";
        }
      }
    );

    await event.save();

    return res.status(200).json({
      message: `Staff change ${action}d successfully`,
      data: event
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      message: "Server Error"
    });
  }
};