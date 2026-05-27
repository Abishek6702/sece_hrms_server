// feedback.controller.js

const Feedback = require("../models/Feedback");
const Event = require("../models/Event");

// CREATE FEEDBACK
const createFeedback = async (req, res) => {
  try {
    const { eventId, organizerId, sections } = req.body;

    // check event exists
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // create feedback
    const feedback = await Feedback.create({
      eventId,
      organizerId,
      sections,
    });

    // store feedback id inside event
    event.feedbacks.push(feedback._id);

    await event.save();

    return res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: feedback,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET FEEDBACKS BY EVENT
const getFeedbackByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    const feedbacks = await Feedback.find({ eventId })
      .populate("organizerId", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: feedbacks.length,
      data: feedbacks,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET SINGLE FEEDBACK
const getFeedbackById = async (req, res) => {
  try {
    const { feedbackId } = req.params;

    const feedback = await Feedback.findById(feedbackId)
      .populate("eventId")
      .populate("organizerId", "name email");

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// DELETE FEEDBACK
const deleteFeedback = async (req, res) => {
  try {
    const { feedbackId } = req.params;

    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    // remove feedback reference from event
    await Event.findByIdAndUpdate(feedback.eventId, {
      $pull: {
        feedbacks: feedback._id,
      },
    });

    // delete feedback
    await Feedback.findByIdAndDelete(feedbackId);

    return res.status(200).json({
      success: true,
      message: "Feedback deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createFeedback,
  getFeedbackByEvent,
  getFeedbackById,
  deleteFeedback,
};