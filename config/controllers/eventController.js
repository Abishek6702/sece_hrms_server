const mongoose = require("mongoose");
const Event = require("../models/Event.js");
const {
  notifyEventCreation,
  notifyHODApproval,
  notifyAdminApproval,
  notifyDepartmentHeads,
  notifyEventRejection,
  notifyEventClosure,
} = require("../utils/eventNotifications.js");
const { restoreTransportInventory } = require("../utils/transport.js");
require("dotenv").config();
const { allocateDefaultMediaStaff } = require("../utils/mediaStaffAllocation");
const {
  handleTransportSubmission,
} = require("../utils/transportSubmissionHandler.js");

const deepParse = (data) => {
  if (typeof data === "string") {
    try {
      return deepParse(JSON.parse(data));
    } catch {
      return data;
    }
  }

  if (Array.isArray(data)) {
    return data.map(deepParse);
  }

  if (typeof data === "object" && data !== null) {
    const result = {};
    for (const key in data) {
      result[key] = deepParse(data[key]);
    }
    return result;
  }

  return data;
};
const fixArrays = (data) => {
  if (!data) return data;

  // transport
  if (data.transportDetails?.transports) {
    data.transportDetails.transports.forEach((t) => {
      if (typeof t.vehicles === "string") {
        t.vehicles = JSON.parse(t.vehicles);
      }
    });
  }

  // refreshment
  if (data.refreshmentDetails?.refreshments) {
    data.refreshmentDetails.refreshments.forEach((r) => {
      if (typeof r.foodTypes === "string") {
        r.foodTypes = JSON.parse(r.foodTypes);
      }
    });
  }

  // accommodation
  if (data.accommodationDetails?.accommodations) {
    data.accommodationDetails.accommodations.forEach((a) => {
      if (typeof a.roomOccupancy === "string") {
        a.roomOccupancy = JSON.parse(a.roomOccupancy);
      }
      if (typeof a.roomCategory === "string") {
        a.roomCategory = JSON.parse(a.roomCategory);
      }
      if (typeof a.dineInCounts === "string") {
        a.dineInCounts = JSON.parse(a.dineInCounts);
      }
    });
  }

  // purchase
  if (data.purchaseDetails?.purchases) {
    data.purchaseDetails.purchases.forEach((p) => {
      if (typeof p.requirementNeeded === "string") {
        p.requirementNeeded = JSON.parse(p.requirementNeeded);
      }

      // Parse giftItems if sent as strings
      ["students", "guests"].forEach((category) => {
        if (p[category]?.giftItems) {
          if (typeof p[category].giftItems === "string") {
            p[category].giftItems = JSON.parse(p[category].giftItems);
          }

          if (Array.isArray(p[category].giftItems)) {
            p[category].giftItems.forEach((item) => {
              if (typeof item.trophy === "string") {
                item.trophy = JSON.parse(item.trophy);
              }
              if (typeof item.voucher === "string") {
                item.voucher = JSON.parse(item.voucher);
              }
            });
          }
        }
      });
    });
  }

  // media
  if (data.mediaRequirementDetails?.mediaRequirements) {
    data.mediaRequirementDetails.mediaRequirements.forEach((m) => {
      if (typeof m.poster?.sizes === "string") {
        m.poster.sizes = JSON.parse(m.poster.sizes);
      }
    });
  }

  return data;
};

const VALID_STATUSES = new Set([
  "Draft",
  "Submitted",
  "HodApproved",
  "AdminApproved",
  "DepartmentReview",
  "FinalApproved",
  "Closed",
  "Rejected",
]);

const normalizeStatus = (payload) => {
  if (payload.status && VALID_STATUSES.has(payload.status)) {
    return payload.status;
  }

  if (payload.isSubmitted === true) {
    return "Submitted";
  }

  return undefined;
};

const normalizeFileReference = (file) => {
  if (!file) return null;

  return {
    url: file.path || file.secure_url || file.url || "",
    publicId: file.filename || file.public_id || file.publicId || "",
  };
};

const ensureObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const ensureArray = (value) => {
  return Array.isArray(value) ? value : [];
};

const mergeObjects = (target, source) => {
  const result = { ...ensureObject(target) };

  Object.keys(source || {}).forEach((key) => {
    const sourceValue = source[key];
    if (
      Array.isArray(sourceValue) ||
      sourceValue === null ||
      typeof sourceValue !== "object"
    ) {
      result[key] = sourceValue;
    } else {
      result[key] = mergeObjects(result[key], sourceValue);
    }
  });

  return result;
};

const ensureMediaRequirement = (mediaRequirementDetails) => {
  const details = ensureObject(mediaRequirementDetails);
  details.mediaRequirements = ensureArray(details.mediaRequirements);

  if (details.mediaRequirements.length === 0) {
    details.mediaRequirements.push({ poster: {}, video: {} });
  }

  const firstItem = ensureObject(details.mediaRequirements[0]);
  firstItem.poster = ensureObject(firstItem.poster);
  firstItem.video = ensureObject(firstItem.video);
  details.mediaRequirements[0] = firstItem;

  return details;
};

const applyUploadedFiles = (event, files) => {
  event.requestDetails = ensureObject(event.requestDetails);
  event.requestDetails.organizerDetails = ensureObject(
    event.requestDetails.organizerDetails,
  );

  if (files.previousEventDocumentation && files.previousEventDocumentation[0]) {
    event.requestDetails.organizerDetails.previousEventDocumentationDetails =
      normalizeFileReference(files.previousEventDocumentation[0]);
  }

  event.mediaRequirementDetails = ensureMediaRequirement(
    event.mediaRequirementDetails,
  );
  const mediaDetails = ensureObject(
    event.mediaRequirementDetails.mediaRequirements[0],
  );
  mediaDetails.poster = ensureObject(mediaDetails.poster);
  mediaDetails.video = ensureObject(mediaDetails.video);

  if (files.referencePosterFiles && files.referencePosterFiles.length > 0) {
    mediaDetails.poster.referencePosterFiles = ensureArray(
      mediaDetails.poster.referencePosterFiles,
    ).concat(
      files.referencePosterFiles.map(normalizeFileReference).filter(Boolean),
    );
  }

  if (
    files.referenceCertificateFiles &&
    files.referenceCertificateFiles.length > 0
  ) {
    mediaDetails.poster.referenceCertificateFiles = ensureArray(
      mediaDetails.poster.referenceCertificateFiles,
    ).concat(
      files.referenceCertificateFiles
        .map(normalizeFileReference)
        .filter(Boolean),
    );
  }

  if (files.referenceFiles && files.referenceFiles.length > 0) {
    mediaDetails.video.referenceFiles = ensureArray(
      mediaDetails.video.referenceFiles,
    ).concat(files.referenceFiles.map(normalizeFileReference).filter(Boolean));
  }

  event.mediaRequirementDetails.mediaRequirements[0] = mediaDetails;
};

exports.createEvent = async (req, res) => {
  // console.log("BODY:", req.body);
  try {
    const payload = {};

    Object.keys(req.body).forEach((key) => {
      payload[key] = deepParse(req.body[key]);
    });

    const eventData = fixArrays({
      ...payload,
      requestDetails: ensureObject(payload.requestDetails),
      mediaRequirementDetails: ensureMediaRequirement(
        payload.mediaRequirementDetails,
      ),
    });
    if (!eventData.timeline) {
      eventData.timeline = {
        departments: {},
      };
    }
    const normalizedStatus = normalizeStatus(payload);
    if (normalizedStatus) {
      eventData.status = normalizedStatus;
      if (normalizedStatus === "Submitted") {
        eventData.isSubmitted = true;
      }
    }

    eventData.requestDetails.organizerDetails = ensureObject(
      eventData.requestDetails.organizerDetails,
    );

    const files = req.files || {};

    if (
      files.previousEventDocumentation &&
      files.previousEventDocumentation[0]
    ) {
      eventData.requestDetails.organizerDetails.previousEventDocumentationDetails =
        normalizeFileReference(files.previousEventDocumentation[0]);
    }

    const mediaDetails = eventData.mediaRequirementDetails.mediaRequirements[0];

    if (files.referencePosterFiles && files.referencePosterFiles.length > 0) {
      mediaDetails.poster.referencePosterFiles = files.referencePosterFiles
        .map(normalizeFileReference)
        .filter(Boolean);
    }

    if (
      files.referenceCertificateFiles &&
      files.referenceCertificateFiles.length > 0
    ) {
      mediaDetails.poster.referenceCertificateFiles =
        files.referenceCertificateFiles
          .map(normalizeFileReference)
          .filter(Boolean);
    }

    if (files.referenceFiles && files.referenceFiles.length > 0) {
      mediaDetails.video.referenceFiles = files.referenceFiles
        .map(normalizeFileReference)
        .filter(Boolean);
    }

    eventData.mediaRequirementDetails.mediaRequirements[0] = mediaDetails;

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // =====================================
      // TRANSPORT INVENTORY DEDUCTION
      // =====================================

      if (eventData.status === "Submitted") {
        await handleTransportSubmission(eventData, session);
      }

      const createdEvents = await Event.create([eventData], { session });

      const event = createdEvents[0];

      await session.commitTransaction();

      // 📧 Send notification
      if (normalizedStatus === "Submitted") {
        await notifyEventCreation(event);
      }

      return res.status(201).json({
        message: "Event created successfully",
        data: event,
      });
    } catch (error) {
      await session.abortTransaction();

      throw error;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("Error creating event:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const payload = {};
    Object.keys(req.body).forEach((key) => {
      payload[key] = deepParse(req.body[key]);
    });

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }
    const oldTransports = structuredClone(
      event.transportDetails?.transports || [],
    );

    if (payload.organizerId) {
      event.organizerId = payload.organizerId;
    }

    if (payload.requestDetails) {
      event.requestDetails = mergeObjects(
        event.requestDetails || {},
        ensureObject(payload.requestDetails),
      );
    }

    if (payload.venueDetails) {
      event.venueDetails = mergeObjects(
        event.venueDetails || {},
        ensureObject(payload.venueDetails),
      );
    }

    if (payload.ictsDetails) {
      event.ictsDetails = mergeObjects(
        event.ictsDetails || {},
        ensureObject(payload.ictsDetails),
      );
    }

    if (payload.audioDetails) {
      event.audioDetails = mergeObjects(
        event.audioDetails || {},
        ensureObject(payload.audioDetails),
      );
    }
    const transportChanged = !!payload.transportDetails;
    if (payload.transportDetails) {
      event.transportDetails = mergeObjects(
        event.transportDetails || {},
        ensureObject(payload.transportDetails),
      );
    }

    if (payload.refreshmentDetails) {
      event.refreshmentDetails = mergeObjects(
        event.refreshmentDetails || {},
        ensureObject(payload.refreshmentDetails),
      );
    }

    if (payload.accommodationDetails) {
      event.accommodationDetails = mergeObjects(
        event.accommodationDetails || {},
        ensureObject(payload.accommodationDetails),
      );
    }

    if (payload.purchaseDetails) {
      event.purchaseDetails = mergeObjects(
        event.purchaseDetails || {},
        ensureObject(payload.purchaseDetails),
      );
    }

    if (payload.mediaRequirementDetails) {
      event.mediaRequirementDetails = mergeObjects(
        ensureMediaRequirement(event.mediaRequirementDetails),
        ensureMediaRequirement(payload.mediaRequirementDetails),
      );
    }

    const wasSubmitted = event.isSubmitted;

    const normalizedStatus = normalizeStatus(payload);

    if (normalizedStatus) {
      event.status = normalizedStatus;
      event.isSubmitted = normalizedStatus === "Submitted";
    } else if (payload.hasOwnProperty("isSubmitted")) {
      event.isSubmitted = payload.isSubmitted;
    }

    applyUploadedFiles(event, req.files || {});

    // =====================================
    // TRANSPORT INVENTORY DEDUCTION
    // =====================================

    const becomingSubmitted =
      !wasSubmitted &&
      (normalizedStatus === "Submitted" || payload.isSubmitted === true);

    if (!event.timeline) {
      event.timeline = {
        departments: {},
      };
    }
    // =====================================
    // FIRST TIME SUBMISSION
    // =====================================
    if (becomingSubmitted) {
      event.timeline.submittedAt = new Date();
    }
    if (becomingSubmitted) {
      await handleTransportSubmission(event);
    }

    // =====================================
    // TRANSPORT UPDATED AFTER SUBMISSION
    // =====================================
    else if (
      wasSubmitted &&
      event.isSubmitted &&
      transportChanged &&
      !event.transportInventoryRestored
    ) {
      // RESTORE OLD VEHICLES

      for (const transport of oldTransports) {
        await restoreTransportInventory(transport.vehicles);
      }

      // DEDUCT NEW VEHICLES

      await handleTransportSubmission(event);
    }
    event.timeline.updatedAt = new Date();
    const updatedEvent = await event.save();
    res
      .status(200)
      .json({ message: "Event updated successfully", data: updatedEvent });
  } catch (error) {
    console.error("Error updating event:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.submitEvent = async (req, res) => {
  try {
    const payload = {};
    Object.keys(req.body).forEach((key) => {
      payload[key] = deepParse(req.body[key]);
    });

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (payload.requestDetails) {
      event.requestDetails = mergeObjects(
        event.requestDetails || {},
        ensureObject(payload.requestDetails),
      );
    }

    if (payload.mediaRequirementDetails) {
      event.mediaRequirementDetails = mergeObjects(
        ensureMediaRequirement(event.mediaRequirementDetails),
        ensureMediaRequirement(payload.mediaRequirementDetails),
      );
    }

    const wasSubmitted = event.isSubmitted;

    const normalizedStatus = normalizeStatus({
      ...payload,
      isSubmitted: true,
    });

    event.status = normalizedStatus || "Submitted";
    event.isSubmitted = true;
    if (!event.timeline) {
      event.timeline = {
        departments: {},
      };
    }
    event.timeline.submittedAt = new Date();

    applyUploadedFiles(event, req.files || {});

    // =====================================
    // TRANSPORT INVENTORY DEDUCTION
    // =====================================

    if (!wasSubmitted) {
      await handleTransportSubmission(event);
    }

    const updatedEvent = await event.save();
    res
      .status(200)
      .json({ message: "Event submitted successfully", data: updatedEvent });
  } catch (error) {
    console.error("Error submitting event:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find();
    res
      .status(200)
      .json({ message: "Events fetched successfully", data: events });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const { module } = req.query;

    let projection = {};

    // ✅ Module based projection
    if (module) {
      projection = {
        requestDetails: 1,
        status: 1,
      };

      switch (module) {
        case "venue":
          projection["venueDetails"] = 1;
          break;

        case "icts":
          projection["ictsDetails"] = 1;
          break;

        case "audio":
          projection["audioDetails"] = 1;
          break;

        case "transport":
          projection["transportDetails"] = 1;
          break;

        case "refreshment":
          projection["refreshmentDetails"] = 1;
          break;

        case "accommodation":
          projection["accommodationDetails"] = 1;
          break;

        case "purchase":
          projection["purchaseDetails"] = 1;
          break;

        case "media":
          projection["mediaRequirementDetails"] = 1;
          break;
      }
    }

    const event = module
      ? await Event.findById(id).select(projection)
      : await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.status(200).json({
      message: "Event fetched successfully",
      data: event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const deleted = await Event.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
      data: deleted,
    });
  } catch (err) {
    console.error("❌ DELETE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getFilteredEvents = async (req, res) => {
  try {
    const { department, eventType, module, status } = req.query;

    // 🔹 FILTER
    let filter = {};

    if (department) {
      filter["requestDetails.organizerDetails.organizingDepartment"] =
        department;
    }

    if (eventType) {
      filter["requestDetails.eventDetails.eventType"] = eventType;
    }

    if (status) {
      filter["status"] = status;
    }

    let events;

    // ✅ If module is provided → use projection
    if (module) {
      let projection = {
        requestDetails: 1,
        status: 1,
      };

      switch (module) {
        case "venue":
          projection["venueDetails"] = 1;
          break;
        case "icts":
          projection["ictsDetails"] = 1;
          break;
        case "audio":
          projection["audioDetails"] = 1;
          break;
        case "transport":
          projection["transportDetails"] = 1;
          break;
        case "refreshment":
          projection["refreshmentDetails"] = 1;
          break;
        case "accommodation":
          projection["accommodationDetails"] = 1;
          break;
        case "purchase":
          projection["purchaseDetails"] = 1;
          break;
        case "media":
          projection["mediaRequirementDetails"] = 1;
          break;
      }

      events = await Event.find(filter).select(projection);
    } else {
      // ✅ No module → return full document
      events = await Event.find(filter);
    }

    res.status(200).json({
      message: "Events fetched successfully",
      count: events.length,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, module, mediaType, remarks, reason } = req.body;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const moduleMap = {
      venue: "venueDetails",
      icts: "ictsDetails",
      audio: "audioDetails",
      transport: "transportDetails",
      refreshment: "refreshmentDetails",
      accommodation: "accommodationDetails",
      purchase: "purchaseDetails",
      media: "mediaRequirementDetails",
    };

    switch (action) {
      case "submit":
        event.isSubmitted = true;
        event.status = "Submitted";
        if (!event.timeline) {
          event.timeline = {
            departments: {},
          };
        }
        event.timeline.submittedAt = new Date();
        // 📧 Send notification for event creation/submission
        await notifyEventCreation(event);
        break;

      case "hodApprove":
        event.isHodApproved = true;
        event.status = "HodApproved";
        if (!event.timeline) {
          event.timeline = {
            departments: {},
          };
        }
        event.timeline.hodApprovedAt = new Date();
        // 📧 Send notification for HOD approval
        await notifyHODApproval(event);
        break;

      case "adminApprove":
        event.adminApproval = true;
        event.status = "Approved";
        if (!event.timeline) {
          event.timeline = {
            departments: {},
          };
        }
        event.timeline.adminApprovedAt = new Date();
        await allocateDefaultMediaStaff(event);
        // 📧 Send notification for admin approval and to department heads
        await notifyAdminApproval(event);
        await notifyDepartmentHeads(event);
        break;

      case "reject":
        event.status = "Rejected";
        if (
          event.isSubmitted &&
          !event.transportInventoryRestored &&
          event.transportDetails?.transports?.length
        ) {
          for (const transport of event.transportDetails.transports) {
            await restoreTransportInventory(transport.vehicles);
          }

          event.transportInventoryRestored = true;
        }
        if (!event.timeline) {
          event.timeline = {
            departments: {},
          };
        }
        event.timeline.rejectedAt = new Date();
        // 📧 Send notification for rejection
        await notifyEventRejection(event, reason || "");
        break;

      case "close":
        event.status = "Closed";
        if (!event.timeline) {
          event.timeline = {
            departments: {},
          };
        }
        event.timeline.closedAt = new Date();
        if (
          event.isSubmitted &&
          !event.transportInventoryRestored &&
          event.transportDetails?.transports?.length
        ) {
          for (const transport of event.transportDetails.transports) {
            await restoreTransportInventory(transport.vehicles);
          }

          event.transportInventoryRestored = true;
        }
        // 📧 Send notification for event closure
        await notifyEventClosure(event, reason || "");
        break;

      case "acknowledge": {
        if (!module) {
          return res.status(400).json({
            message: "Module is required for acknowledgement",
          });
        }

        const path = moduleMap[module];

        if (!path) {
          return res.status(400).json({ message: "Invalid module" });
        }

        if (!event[path]) {
          event[path] = {};
        }
        if (!event.timeline) {
          event.timeline = {};
        }

        if (!event.timeline.departments) {
          event.timeline.departments = {};
        }

        if (module === "media") {
          if (!mediaType || !["poster", "video"].includes(mediaType)) {
            return res.status(400).json({
              message: "Valid mediaType is required for media module",
            });
          }

          event[path].mediaRequirements.forEach((media) => {
            if (!event.timeline.departments[mediaType]) {
              event.timeline.departments[mediaType] = {};
            }

            event.timeline.departments[mediaType].acknowledgedAt = new Date();
            media[mediaType].status = "Acknowledged";
            media[mediaType].remarks = remarks || "";
          });
        } else {
          if (!event[path].status) {
            event[path].status = {};
          }

          event[path].status.status = "Acknowledged";
          if (!event.timeline.departments[module]) {
            event.timeline.departments[module] = {};
          }

          event.timeline.departments[module].acknowledgedAt = new Date();
          event[path].status.remarks = remarks || "";
        }

        break;
      }
      case "adminCancel": {
        if (!module) {
          return res.status(400).json({
            message: "Module is required for admin cancellation",
          });
        }

        const path = moduleMap[module];

        if (!path) {
          return res.status(400).json({ message: "Invalid module" });
        }

        if (!event[path]) {
          event[path] = {};
        }

        if (module === "media") {
          if (!mediaType || !["poster", "video"].includes(mediaType)) {
            return res.status(400).json({
              message: "Valid mediaType is required for media module",
            });
          }

          event[path].mediaRequirements.forEach((media) => {
            media[mediaType].status = "Admin Cancelled";
          });
        } else {
          if (!event[path].status) {
            event[path].status = {};
          }

          event[path].status.status = "Admin Cancelled";
        }

        break;
      }
      case "complete": {
        if (!module) {
          return res.status(400).json({
            message: "Module is required for completion",
          });
        }

        const path = moduleMap[module];

        if (!path) {
          return res.status(400).json({ message: "Invalid module" });
        }

        if (!event[path]) {
          event[path] = {};
        }
        if (!event.timeline) {
          event.timeline = {};
        }

        if (!event.timeline.departments) {
          event.timeline.departments = {};
        }

        if (module === "media") {
          if (!mediaType || !["poster", "video"].includes(mediaType)) {
            return res.status(400).json({
              message: "Valid mediaType is required for media module",
            });
          }

          event[path].mediaRequirements.forEach((media) => {
            media[mediaType].status = "Completed";
            media[mediaType].remarks = remarks || "";
            if (!event.timeline.departments[mediaType]) {
              event.timeline.departments[mediaType] = {};
            }

            event.timeline.departments[mediaType].completedAt = new Date();
          });
        } else {
          if (!event[path].status) {
            event[path].status = {};
          }

          event[path].status.status = "Completed";
          if (!event.timeline.departments[module]) {
            event.timeline.departments[module] = {};
          }

          event.timeline.departments[module].completedAt = new Date();
          event[path].status.remarks = remarks || "";
        }

        break;
      }

      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    await event.save();

    res.status(200).json({
      message: "Status updated successfully",
      data: event,
    });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRequirementDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id).select(
      "requestDetails.requirementDetails",
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.status(200).json({
      success: true,
      requirementDetails: event.requestDetails?.requirementDetails || {},
    });
  } catch (error) {
    console.error("Error fetching requirement details:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Get draft event for a particular user
exports.getUserDraftEvents = async (req, res) => {
  try {
    const { organizerId } = req.params;

    const draftEvents = await Event.find({
      organizerId,
      status: "Draft",
      isSubmitted: false,
    }).sort({ updatedAt: -1 });

    // no drafts found
    if (!draftEvents || draftEvents.length === 0) {
      return res.status(200).json({
        success: true,
        hasDrafts: false,
        totalDrafts: 0,
        message: "No draft events found",
        data: [],
      });
    }

    // drafts found
    return res.status(200).json({
      success: true,
      hasDrafts: true,
      totalDrafts: draftEvents.length,
      message: "Draft events fetched successfully",
      data: draftEvents,
    });
  } catch (error) {
    console.error("Get Draft Events Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

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
