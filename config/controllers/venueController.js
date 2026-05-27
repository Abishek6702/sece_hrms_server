const Venue = require('../models/Venue');

const xlsx = require('xlsx');

const importVenuesFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Read Excel file
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    // Transform data → MongoDB structure
    const formatted = rawData.map(row => {
      const r = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.trim(), v])
      );
    
      return {
        block: r.Block || "",
        floor: r.Floor || "",   // safe fallback
        venue: r.Venue || "",
        capacity: Number(r.Capacity || 0),
    
        audio: {
          wiredMic: Number(r["Wired Mic"] || 0),
          handMic: Number(r.HandMic || 0),
          collarMic: Number(r.CollarMic || 0),
          handSpeaker: Number(r["Hand Speaker"] || 0),
          speakerWithMixer: Number(r["Speaker set with Mixer"] || 0),
          paSystem: Number(r.PASystem || 0),
          podiumWithMic: Number(r["Podium with mic"] || 0)
        },
    
        seating: {
          withoutProctoring: Number(r["Without Procotoring"] || 0),
          withProctoring: Number(r["Procotoring"] || 0)
        },
    
        remarks: r.Remarks || ""
      };
    });

    const invalidRows = formatted.filter(
      v => !v.venue   // only venue required
    );
    
    if (invalidRows.length > 0) {
      return res.status(400).json({
        message: "Invalid data in Excel",
        invalidCount: invalidRows.length,
        sample: invalidRows.slice(0, 3)
      });
    }

    // Insert into DB
    const result = await Venue.insertMany(formatted);

    res.json({
      message: "Import successful",
      insertedCount: result.length
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ➤ Create single venue
const createVenue = async (req, res) => {
  try {
    const venue = new Venue(req.body);
    const saved = await venue.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ➤ Get all venues
const getAllVenues = async (req, res) => {
  try {
    const venues = await Venue.find().sort({ createdAt: -1 });
    res.json(venues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ➤ Get venue by ID
const getVenueById = async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);

    if (!venue) {
      return res.status(404).json({ message: "Venue not found" });
    }

    res.json(venue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ➤ Update venue
const updateVenue = async (req, res) => {
  try {
    const updated = await Venue.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Venue not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ➤ Delete venue
const deleteVenue = async (req, res) => {
  try {
    const deleted = await Venue.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Venue not found" });
    }

    res.json({ message: "Venue deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const getVenueOptions = async (req, res) => {
  try {
    const { type, minCapacity } = req.query;

    let query = {};

    // ✅ Capacity filter (common for all)
    if (minCapacity) {
      query.capacity = { $gte: Number(minCapacity) };
    }

    let projection = {};

    switch (type) {

      // 🔹 Basic venue list
      case "venue":
        projection = { venue: 1, capacity: 1 };
        break;

      // 🔹 Audio filter
      case "audio":
        query.$or = [
          { "audio.handMic": { $gt: 0 } },
          { "audio.collarMic": { $gt: 0 } },
          { "audio.paSystem": { $gt: 0 } },
          { "audio.speakerWithMixer": { $gt: 0 } },
          { "audio.handSpeaker": { $gt: 0 } }
        ];
        projection = { venue: 1, capacity: 1, audio: 1 };
        break;

      // 🔹 Proctoring filter
      case "proctoring":
        query.$or = [
          { "seating.withProctoring": { $gt: 0 } },
          { "seating.withoutProctoring": { $gt: 0 } }
        ];
        projection = { venue: 1, capacity: 1, seating: 1 };
        break;

      default:
        return res.status(400).json({
          message: "Invalid type. Use venue | audio | proctoring"
        });
    }

    const data = await Venue.find(query, projection);

    res.json({
      count: data.length,
      data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  importVenuesFromExcel,
  createVenue,
  getAllVenues,
  getVenueById,
  updateVenue,
  deleteVenue,
  getVenueOptions
};