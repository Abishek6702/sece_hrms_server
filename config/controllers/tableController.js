const mongoose = require("mongoose");
const Event = require("../models/Event.js");
require("dotenv").config();

const getDepartmentStatus = (moduleStatus, overallStatus) => {
  // if event closed -> always completed
  if (overallStatus === "Closed") {
    return "Completed";
  }

  // existing module status
  if (moduleStatus) {
    return moduleStatus;
  }

  // pending states
  if (
    ["Submitted", "HodApproved", "Approved", "DepartmentReview"].includes(
      overallStatus,
    )
  ) {
    return "Pending for Acknowledge";
  }

  return null;
};

exports.getDashboardTable = async (req, res) => {
  try {
    const { module } = req.query;

    const page = parseInt(req.query.page) || 1;

    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const baseQuery = {
      status: { $ne: "Draft" },
    };

    const events = await Event.find(baseQuery)
      .populate("organizerId", "name email")
      .lean();

    let data = [];

    for (const event of events) {
      const commonData = {
        eventId: event._id,

        facultyId: event.organizerId?._id,

        facultyName: event.organizerId?.name,

        eventName: event.requestDetails?.eventDetails?.eventName,

        eventType: event.requestDetails?.eventDetails?.eventType,

        organizingDepartment:
          event.requestDetails?.organizerDetails?.organizingDepartment,

        dates:
          event.requestDetails?.eventDetails?.eventSchedule?.map(
            (d) => d.eventDate,
          ) || [],

        // COMMON VENUES
        venues: event.venueDetails?.venues?.map((v) => v.venueName) || [],

        overallStatus: event.status,

        adminApproval: event.adminApproval,
      };

      // ================= ADMIN =================
      if (module === "admin") {
        data.push(commonData);
      }

      // ================= FACULTY =================
      else if (module === "faculty") {
        data.push({
          ...commonData,
          isSubmitted: event.isSubmitted,
          hodApproved: event.isHodApproved,
          adminApproval: event.adminApproval,
        });
      }

      // ================= VENUE =================
      else if (module === "venue" && event.venueDetails?.venues?.length) {
        data.push({
          ...commonData,

          venues: event.venueDetails.venues.map((v) => ({
            venueName: v.venueName,
            participants: v.numberOfParticipants,
          })),

          departmentStatus: getDepartmentStatus(
            event.venueDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= ICTS =================
      else if (module === "icts" && event.ictsDetails?.ictses?.length) {
        data.push({
          ...commonData,

          venues: event.ictsDetails.ictses.map((i) => ({
            venue: i.venueName,
            internetFacility: i.internetFacility,
          })),

          departmentStatus: getDepartmentStatus(
            event.ictsDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= AUDIO =================
      else if (module === "audio" && event.audioDetails?.audios?.length) {
        data.push({
          ...commonData,

          venues: event.audioDetails.audios.map((a) => ({
            venue: a.venueName,
            items: a.audioItems,
          })),

          departmentStatus: getDepartmentStatus(
            event.audioDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= TRANSPORT =================
      else if (
        module === "transport" &&
        event.transportDetails?.transports?.length
      ) {
        data.push({
          ...commonData,

          transport: event.transportDetails.transports,

          departmentStatus: getDepartmentStatus(
            event.transportDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= FOOD =================
      else if (
        module === "food" &&
        event.refreshmentDetails?.refreshments?.length
      ) {
        data.push({
          ...commonData,

          refreshments: event.refreshmentDetails.refreshments,

          departmentStatus: getDepartmentStatus(
            event.refreshmentDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= ACCOMMODATION =================
      else if (
        module === "accommodation" &&
        event.accommodationDetails?.accommodations?.length
      ) {
        data.push({
          ...commonData,

          accommodations: event.accommodationDetails.accommodations,

          departmentStatus: getDepartmentStatus(
            event.accommodationDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= PURCHASE =================
      else if (
        module === "purchase" &&
        event.purchaseDetails?.purchases?.length
      ) {
        data.push({
          ...commonData,

          purchases: event.purchaseDetails.purchases,

          departmentStatus: getDepartmentStatus(
            event.purchaseDetails?.status?.status,
            event.status,
          ),
        });
      }

      // ================= MEDIA =================
      else if (
        module === "media" &&
        event.mediaRequirementDetails?.mediaRequirements?.length
      ) {
        data.push({
          ...commonData,

          media: event.mediaRequirementDetails.mediaRequirements,
        });
      }

      // ================= POSTER =================
      else if (
        module === "poster" &&
        event.mediaRequirementDetails?.mediaRequirements?.length
      ) {
        const posters = event.mediaRequirementDetails.mediaRequirements.filter(
          (m) => m.poster,
        );

        if (posters.length) {
          data.push({
            ...commonData,

            poster: posters.map((p) => ({
              content: p.poster.posterContent,
              deliveryDate: p.poster.deliveryDate,

              priority: p.poster.priority,

              departmentStatus: getDepartmentStatus(
                p.poster.status,
                event.status,
              ),
            })),
          });
        }
      }

      // ================= VIDEO =================
      else if (
        module === "video" &&
        event.mediaRequirementDetails?.mediaRequirements?.length
      ) {
        const videos = event.mediaRequirementDetails.mediaRequirements.filter(
          (m) => m.video,
        );

        if (videos.length) {
          data.push({
            ...commonData,

            video: videos.map((v) => ({
              content: v.video.videoContent,

              deliveryDate: v.video.deliveryDate,

              priority: v.video.priority,

              departmentStatus: getDepartmentStatus(
                v.video.status,
                event.status,
              ),
            })),
          });
        }
      }
    }

    const totalRecords = data.length;

    const paginatedData = data.slice(skip, skip + limit);

    return res.status(200).json({
      module,

      count: totalRecords,

      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },

      data: paginatedData,
    });
  } catch (error) {
    console.error("Dashboard table error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};
