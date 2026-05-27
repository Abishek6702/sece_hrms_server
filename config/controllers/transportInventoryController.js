const TransportInventory = require(
    "../models/TransportInventory"
  );
  
  
  // ============================================
  // CREATE INVENTORY
  // ============================================
  
  exports.createTransportInventory = async (
    req,
    res
  ) => {
    try {
  
      const {
        vehicleType,
        totalCount,
        description,
      } = req.body;
  
      const existing =
        await TransportInventory.findOne({
          vehicleType,
        });
  
      if (existing) {
        return res.status(400).json({
          message:
            "Vehicle type already exists",
        });
      }
  
      const inventory =
        await TransportInventory.create({
          vehicleType,
          totalCount,
          availableCount: totalCount,
          description,
        });
  
      res.status(201).json({
        message:
          "Transport inventory created successfully",
        data: inventory,
      });
  
    } catch (error) {
  
      console.error(
        "Create inventory error:",
        error
      );
  
      res.status(500).json({
        message: "Server error",
      });
    }
  };
  
  
  // ============================================
  // GET ALL INVENTORY
  // ============================================
  
  exports.getAllTransportInventory =
    async (req, res) => {
  
      try {
  
        const inventory =
          await TransportInventory.find({
            isActive: true,
          }).sort({
            vehicleType: 1,
          });
  
        res.status(200).json({
          message:
            "Transport inventory fetched successfully",
          data: inventory,
        });
  
      } catch (error) {
  
        console.error(
          "Fetch inventory error:",
          error
        );
  
        res.status(500).json({
          message: "Server error",
        });
      }
    };
  
  
  // ============================================
  // GET SINGLE INVENTORY
  // ============================================
  
  exports.getTransportInventoryById =
    async (req, res) => {
  
      try {
  
        const inventory =
          await TransportInventory.findById(
            req.params.id
          );
  
        if (!inventory) {
          return res.status(404).json({
            message:
              "Inventory not found",
          });
        }
  
        res.status(200).json({
          message:
            "Inventory fetched successfully",
          data: inventory,
        });
  
      } catch (error) {
  
        console.error(
          "Fetch single inventory error:",
          error
        );
  
        res.status(500).json({
          message: "Server error",
        });
      }
    };
  
  
    // ============================================
    // UPDATE INVENTORY
    // ============================================
    
    exports.updateTransportInventory =
      async (req, res) => {
    
        try {
    
          const inventory =
            await TransportInventory.findById(
              req.params.id
            );
    
          if (!inventory) {
            return res.status(404).json({
              message:
                "Inventory not found",
            });
          }
    
          const {
            totalCount,
            description,
            isActive,
          } = req.body;
    
          // =====================================
          // SAFE TOTAL COUNT UPDATE
          // =====================================
    
          if (totalCount !== undefined) {
    
            const bookedCount =
              inventory.totalCount -
              inventory.availableCount;
    
            // prevent invalid reduction
    
            if (totalCount < bookedCount) {
    
              return res.status(400).json({
                message:
                  `Cannot reduce total count below booked count (${bookedCount})`,
              });
            }
    
            inventory.totalCount =
              totalCount;
    
            inventory.availableCount =
              totalCount - bookedCount;
          }
    
          // =====================================
          // DESCRIPTION
          // =====================================
    
          if (description !== undefined) {
    
            inventory.description =
              description;
          }
    
          // =====================================
          // ACTIVE STATUS
          // =====================================
    
          if (isActive !== undefined) {
    
            inventory.isActive =
              isActive;
          }
    
          await inventory.save();
    
          res.status(200).json({
            message:
              "Inventory updated successfully",
            data: inventory,
          });
    
        } catch (error) {
    
          console.error(
            "Update inventory error:",
            error
          );
    
          res.status(500).json({
            message: "Server error",
          });
        }
      };
  
  
      // ============================================
      // DELETE INVENTORY
      // ============================================
      
      exports.deleteTransportInventory =
        async (req, res) => {
      
          try {
      
            const inventory =
              await TransportInventory.findById(
                req.params.id
              );
      
            if (!inventory) {
              return res.status(404).json({
                message:
                  "Inventory not found",
              });
            }
      
            // =====================================
            // PREVENT DELETE IF ACTIVE BOOKINGS
            // =====================================
      
            const bookedCount =
              inventory.totalCount -
              inventory.availableCount;
      
            if (bookedCount > 0) {
      
              return res.status(400).json({
                message:
                  `Cannot delete. ${bookedCount} vehicles currently allocated`,
              });
            }
      
            // SOFT DELETE
      
            await TransportInventory.findByIdAndDelete(
              req.params.id
            );
            
            res.status(200).json({
              message:
                "Inventory deleted successfully",
            });
      
          } catch (error) {
      
            console.error(
              "Delete inventory error:",
              error
            );
      
            res.status(500).json({
              message: "Server error",
            });
          }
        };