    const express = require('express');
    const router = express.Router();
    const multer=require('multer');
    const pool = require('../db'); 
    const bcrypt = require('bcrypt');
    const upload = multer({ dest: 'public/images/' });
    const fs=require('fs');
    const PDFDocument=require('pdfkit');
    const path=require('path');

    const authenticateSecurityHead = (req, res, next) => {
        if (!req.session.user || req.session.user.role !== 1) {
            console.log("Access denied: User not logged in or incorrect role");
            return res.status(403).send('Access denied.');
        }
        next();
    };
    const mysql = require('mysql2/promise');
    // Security Head Home Page
    router.get('/home', async (req, res) => {
        if (!req.session.user || req.session.user.role !== 1) {
            console.log("Access denied: User not logged in or incorrect role");
            return res.status(403).send('Access denied.');
        }
    
        const { name } = req.session.user;
    
        try {
            // Query the database for updated counts
            const [newIncidents] = await pool.query('SELECT COUNT(*) AS count FROM incidents WHERE report_status = "new"');
            const [pendingActions] = await pool.query('SELECT COUNT(*) AS count FROM investigation WHERE report_status = "pending"');
    
            const thresholdAlerts = 2; // Replace with real logic if applicable
            const recentUpdates = [
                { id: 1, description: 'Incident 1 details', created_at: new Date() },
                { id: 2, description: 'Incident 2 details', created_at: new Date() },
            ];
    
            // Render the page with updated data
            res.render('sh-home', {
                name,
                newIncidents: newIncidents.count,
                pendingActions: pendingActions.count,
                thresholdAlerts,
                recentUpdates,
            });
        } catch (error) {
            console.error('Error fetching incident data:', error);
            res.status(500).send('Internal server error.');
        }
    });
    
    
    router.get('/incidents', authenticateSecurityHead, async (req, res) => {
        try {
            console.log("Fetching incidents from the database...");
    
            // Query the database for incidents
            const incidents = await pool.query("SELECT * FROM add_incidents");
    
            console.log("Incidents fetched: ", incidents); // Log the data for debugging
    
            // Ensure incidents is always an array
            const { name } = req.session.user;
            res.render("sh-incidents", {
                name,
                incidents: incidents.length > 0 ? incidents : [], // Ensure incidents is an array
            });
        } catch (error) {
            console.error("Error fetching incidents:", error);
            res.status(500).send("Server Error");
        }
    });



    // Security Head Account Page
    router.get('/account', authenticateSecurityHead, async (req, res) => {
        const { role, name } = req.session.user;
        let profilePicture = '/images/default-profile.png'; // Default profile picture

        try {
            // Fetch the profile picture from the database
            const result = await pool.query('SELECT profile_picture FROM admin_users WHERE role = ?', [role]);

            if (result.length > 0 && result[0].profile_picture) {
                profilePicture = result[0].profile_picture;
            }

            // Render the account page with dynamic data
            res.render('sh-account', { name, profilePicture });
        } catch (err) {
            console.error('Error fetching profile picture:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    router.get('/reports', authenticateSecurityHead, async (req, res) => {
        const { name } = req.session.user;
    
        try {
            const reportsNew = await pool.query("SELECT uid, type_of_incident, created_at FROM incidents WHERE report_status = 'new' ORDER BY created_at DESC");
            //const reportsPending = await pool.query("SELECT uid, type_of_incident, created_at FROM incidents WHERE report_status = 'pending'");
            const reportsSolved = await pool.query("SELECT uid, type_of_incident, created_at FROM incidents WHERE report_status = 'action taken' ORDER BY created_at DESC");
    
            res.render('sh-reports', {
                name,
                reportsNew: Array.isArray(reportsNew) ? reportsNew : Object.values(reportsNew),
                //reportsPending: Array.isArray(reportsPending) ? reportsPending : Object.values(reportsPending),
                reportsSolved: Array.isArray(reportsSolved) ? reportsSolved : Object.values(reportsSolved),
            });
        } catch (err) {
            console.error("Error fetching reports:", err.message);
            res.status(500).send("Server Error");
        }
    });


    router.get('/investreports', authenticateSecurityHead, async (req, res) => {
        const { name } = req.session.user;
    
        try {
            const reportsNew = await pool.query("SELECT investigation.uid, incidents.type_of_incident, investigation.department FROM investigation JOIN incidents ON investigation.uid = incidents.uid WHERE investigation.report_status = 'new' ORDER BY investigation.created_at DESC;");
            const reportsPending = await pool.query("SELECT investigation.uid, incidents.type_of_incident, investigation.department FROM investigation JOIN incidents ON investigation.uid = incidents.uid WHERE investigation.report_status = 'pending' ORDER BY investigation.created_at DESC;");
            const reportsSolved = await pool.query("SELECT investigation.uid, incidents.type_of_incident, investigation.department FROM investigation JOIN incidents ON investigation.uid = incidents.uid WHERE investigation.report_status = 'solved' ORDER BY investigation.created_at DESC;");
    
            res.render('sh-investreports', {
                name,
                reportsNew: Array.isArray(reportsNew) ? reportsNew : Object.values(reportsNew),
                reportsPending: Array.isArray(reportsPending) ? reportsPending : Object.values(reportsPending),
                reportsSolved: Array.isArray(reportsSolved) ? reportsSolved : Object.values(reportsSolved),
            });
        } catch (err) {
            console.error("Error fetching reports:", err.message);
            res.status(500).send("Server Error");
        }
    });
    

    router.get('/visualize', authenticateSecurityHead, (req, res) => {
        const { name } = req.session.user;

        res.render('sh-visualize', { name });
    });

    router.get('/notifications', authenticateSecurityHead, (req, res) => {
        const { name } = req.session.user;

        res.render('sh-notifications', { name });
    });

    router.get('/investigation', authenticateSecurityHead, async (req, res) => {
        const { name } = req.session.user;
        const departments = await pool.query("SELECT departmentID, departmentName FROM departments");
        res.render('sh-investigation', { name, departments:departments.length>0?departments:[] });
    });

    // Upload Profile Picture
    router.post('/account/upload-picture', authenticateSecurityHead, upload.single('profile_picture'), async (req, res) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const filePath = `/images/${req.file.filename}`; // Path of the uploaded file

        try {
            // Update the profile picture in the database
            const result = await pool.query('UPDATE admin_users SET profile_picture = ? WHERE role = ?', [filePath, req.session.user.role]);

            if (result.affectedRows > 0) {
                res.redirect('/security-head/account');
            } else {
                res.status(500).send('Failed to update profile picture');
            }
        } catch (err) {
            console.error('Error updating profile picture:', err);
            res.status(500).send('Internal Server Error');
        }
    });

    router.post('/account/update-profile', authenticateSecurityHead, async (req, res) => {
        const { name } = req.body;
        const role = req.session.user.role;

        if (!name.trim()) {
            return res.status(400).send('Name cannot be empty.');
        }

        try {
            const result = await pool.query('UPDATE admin_users SET name = ? WHERE role = ?', [name, role]);

            if (result.affectedRows > 0) {
                // Update session immediately
                req.session.user.name = name;
                return res.redirect('/security-head/account');
            } else {
                return res.status(500).send('Failed to update name.');
            }
        } catch (err) {
            console.error('Error updating name:', err);
            return res.status(500).send('Internal Server Error');
        }
    });

    router.post('/account/update-password', authenticateSecurityHead, async (req, res) => {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const role = req.session.user.role;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).send('All fields are required.');
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).send('New password and confirm password do not match.');
        }

        try {
            // Fetch the stored password from the database
            const result = await pool.query('SELECT password FROM admin_users WHERE role = ?', [role]);

            if (result.length === 0) {
                return res.status(404).send('User not found.');
            }

            const storedPassword = result[0].password;

            let isMatch;
            
            // Check if stored password is hashed or plaintext
            if (storedPassword.length === 60) { // bcrypt hash is always 60 characters
                isMatch = await bcrypt.compare(currentPassword, storedPassword);
            } else {
                isMatch = currentPassword === storedPassword; // Direct comparison for plaintext
            }

            if (!isMatch) {
                return res.status(401).send('Current password is incorrect.');
            }

            // Hash the new password before storing it
            const hashedNewPassword = await bcrypt.hash(newPassword, 10);

            // Update password in the database
            const updateResult = await pool.query('UPDATE admin_users SET password = ? WHERE role = ?', [hashedNewPassword, role]);

            if (updateResult.affectedRows > 0) {
                return res.redirect('/security-head/account?success=Password updated successfully');
            } else {
                return res.status(500).send('Failed to update password.');
            }
        } catch (err) {
            console.error('Error updating password:', err);
            return res.status(500).send('Internal Server Error');
        }
    });


    router.post(`/investreports/update-report-status`, authenticateSecurityHead, async (req, res) => {
        const { uid } = req.body;
        const { departmentID } = req.body;
        try {
            
            const result = await pool.query(
                'UPDATE investigation SET report_status = "solved" WHERE uid = ? AND department = ?',
                [uid, departmentID]
            );
    
            if (result.affectedRows > 0) {
                res.json({ success: true, message: "Report status updated successfully." });
            } else {
                res.json({ success: false, message: "No report found to update." });
            }
        } catch (error) {
            console.error("Error updating report status:", error);
            res.status(500).json({ success: false, message: "Internal Server Error" });
        }
    });
    

    router.get('/incident/:uid/pdf', authenticateSecurityHead, async (req, res) => {
        const uid = decodeURIComponent(req.params.uid);
    
        try {
            // Validate UID
            if (!uid) return res.status(400).send('Invalid UID');
    
            // Fetch incident data
            const rows = await pool.query("SELECT * FROM incidents WHERE uid = ?", [uid]);
            if (!rows || rows.length === 0) return res.status(404).send('Incident not found.');
    
            const report = rows[0];
    
            // Generate safe filename
            const safeUid = uid.replace(/[^a-zA-Z0-9-_]/g, '_');
            const reportPath = path.join(__dirname, '../public/reports', `incident-${safeUid}.pdf`);
    
            // Ensure reports directory exists
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    
            // Define watermark path
            const watermarkPath = path.join(__dirname, '../public/images/wm.png');
            
            // Define logo path
            const logoPath = path.join(__dirname, '../public/images/logo.png');
    
            // Create PDF document
            const doc = new PDFDocument({
                margins: { top: 80, bottom: 70, left: 40, right: 40 },
                size: 'A4',
                bufferPages: true 
            });
    
            // Store page references to add watermark at the end
            const pageRefs = [];
    
            // Try to register Nunito Sans font with error handling
            try {
                const fontPath = path.join(__dirname, '../public/fonts/NunitoSans-BoldItalic.ttf');
                // Check if font file exists before registering
                if (fs.existsSync(fontPath)) {
                    doc.registerFont('NunitoSans-BoldItalic', fontPath);
                } else {
                    console.log("Font file not found, will use fallback font");
                }
            } catch (err) {
                console.log("Error registering font:", err);
                // Continue without the custom font
            }
    
            const writeStream = fs.createWriteStream(reportPath);
            writeStream.on('error', err => res.status(500).send("Error writing the PDF file."));
    
            res.setHeader('Content-Disposition', `attachment; filename="incident-${safeUid}.pdf"`);
            res.setHeader('Content-Type', 'application/pdf');
    
            doc.pipe(writeStream);
    
            // Color Theme
            const colors = {
                primary: '#ff4444',
                secondary: '#159895',
                background: '#F8F9FA',
                text: '#212529'
            };
    
            // Utility functions
            const formatValue = value => value ? String(value).trim() : 'N/A';
            const parseJSONSafely = json => {
                try {
                    return typeof json === 'string' ? JSON.parse(json) : json || [];
                } catch {
                    return [];
                }
            };
    
            const pageHeight = doc.page.height;
            const footerHeight = 60; 
            const contentEndY = pageHeight - footerHeight;
    
            // Modified watermark function - to be applied after all content is added
            const addWatermarkToPage = (pageRef) => {
                doc.switchToPage(pageRef);
                doc.save();
                
                try {
                    // Check if watermark file exists
                    if (fs.existsSync(watermarkPath)) {
                        // Define exact dimensions for watermark
                        const watermarkWidth = 180; // Width in points (72 points = 1 inch)
                        const watermarkHeight = 180; // Height in points
                        
                        // Calculate center position
                        const centerX = (doc.page.width - watermarkWidth) / 2;
                        const centerY = (doc.page.height - watermarkHeight) / 2;
                        
                        // Add the watermark with opacity and centered
                        doc.opacity(0.15) // Set opacity for watermark
                           .image(watermarkPath, centerX, centerY, {
                                width: watermarkWidth,
                                height: watermarkHeight
                            });
                    }
                } catch (err) {
                    console.error("Watermark error:", err);
                    // Continue without watermark if error occurs
                }
                
                doc.restore();
            };
    
            // Header function with logo and font fallback
            const addHeader = () => {
                const currentY = doc.y;
                doc.y = 20;
                
                // Add line
                doc.lineWidth(3).moveTo(40, 40).lineTo(doc.page.width - 40, 40).stroke(colors.primary);
                
                // Try to use Nunito Sans with fallback to Helvetica-BoldOblique if not available
                try {
                    doc.fontSize(12).fillColor(colors.text).font('NunitoSans-BoldItalic').text('Kannur International Airport', 40, 20);
                } catch (err) {
                    // Fallback to a standard font that's always available in PDFKit
                    doc.fontSize(12).fillColor(colors.text).font('Helvetica-BoldOblique').text('Kannur International Airport', 40, 20);
                }
                
                try {
                    // Check if logo file exists
                    if (fs.existsSync(logoPath)) {
                        // Add logo on right side with specific dimensions
                        const logoWidth = 80; // Width in points (72 points = 1 inch)
                        const logoHeight = 25; // Height in points
                        const logoX = doc.page.width - 40 - logoWidth; // Position from right edge
                        const logoY = 8; // Vertical position to center with text
                        
                        doc.image(logoPath, logoX, logoY, {
                            width: logoWidth,
                            height: logoHeight
                        });
                    }
                } catch (err) {
                    console.error("Logo error:", err);
                    // Continue without logo if error occurs
                }
                
                doc.y = currentY > 60 ? currentY : 60;
            };
    
            // Track pages for watermark
            pageRefs.push(doc.bufferedPageRange().start);
    
            // On new page, add header and track page reference
            doc.on('pageAdded', () => {
                addHeader();
                pageRefs.push(doc.bufferedPageRange().count - 1);
            });
    
            // Add header to first page
            addHeader();
            
            // Function to add consistently positioned heading
            const addSectionHeading = (text) => {
                const y = doc.y;
                doc.fontSize(14).fillColor(colors.primary).font('Helvetica-Bold').text(text, 40, y);
                doc.moveDown(0.5);
            };
            
            // Table function with consistent heading positioning
            const createFullTable = (doc, title, data) => {
                if (doc.y > contentEndY - 100) doc.addPage();
                
                // Use absolute positioning for the heading
                addSectionHeading(title);
                
                const startX = 40, pageWidth = doc.page.width - 80, rowHeight = 20;
                const colWidths = [pageWidth * 0.4, pageWidth * 0.6];
                let startY = doc.y;
    
                Object.entries(data).forEach(([key, value], index) => {
                    if (startY + rowHeight > contentEndY - 20) {
                        doc.addPage();
                        startY = doc.y;
                    }
                    doc.fillColor(index % 2 === 0 ? '#FFFFFF' : colors.background)
                       .rect(startX, startY, pageWidth, rowHeight).fill();
                    doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(10)
                       .text(formatValue(key), startX + 5, startY + 5, { width: colWidths[0] });
                    doc.font('Helvetica').fontSize(10)
                       .text(formatValue(value), startX + colWidths[0], startY + 5, { width: colWidths[1] });
                    startY += rowHeight;
                });
                doc.y = startY + 10;
            };
    
            // List function with pagination and consistent heading positioning
            const addItemList = (title, items, formatter) => {
                if (doc.y > contentEndY - 100) doc.addPage();
                
                // Use absolute positioning for the heading
                addSectionHeading(title);
                
                items.forEach((item, index) => {
                    if (doc.y > contentEndY - 50) doc.addPage();
                    doc.font('Helvetica').fontSize(10).fillColor(colors.text).text(`${index + 1}. ${formatter(item)}`);
                });
                doc.moveDown(1);
            };
    
            // Function to add incident image if available - Modified to use KPI-Project\uploads
            const addIncidentImage = (imagePath) => {
                if (!imagePath) return;
                
                try {
                    // Construct the full path using the KPI-Project/uploads folder
                    const fullImagePath = path.join(__dirname, '../../KPI-Project/uploads', imagePath);
                    
                    if (fs.existsSync(fullImagePath)) {
                        if (doc.y > contentEndY - 150) doc.addPage();
                        
                        addSectionHeading('Incident Image');
                        
                        const maxWidth = doc.page.width - 80;
                        const maxHeight = 200;
                        
                        doc.image(fullImagePath, 40, doc.y, {
                            fit: [maxWidth, maxHeight],
                            align: 'center',
                            valign: 'center'
                        });
                        
                        doc.moveDown(2);
                    } else {
                        console.log(`Image not found at path: ${fullImagePath}`);
                    }
                } catch (err) {
                    console.error("Image error:", err);
                    // Continue without image if error occurs
                }
            };
    
            // Add title with absolute positioning
            const y = doc.y;
            doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.primary)
               .text('Comprehensive Incident Report', 40, y);
            doc.moveDown(1);
    
            // Basic incident details - added more fields
            createFullTable(doc, '1. Basic Incident Details', { 
                'Incident UID': report.uid, 
                'Date': report.date, 
                'Incident Time': report.incident_time, 
                'Location': report.location, 
                'Description of Location': report.location_description,
                'Incident Type': report.type_of_incident, 
                'Description': report.description,
                'No. of Injured': report.no_of_injured,
                'Injured Person Category': report.injured_person_category,
                'Type of Casualty': report.type_of_casualty
            });
    
            // Medical & Alert Information - added nurse field
            createFullTable(doc, '2. Medical & Alert Information', { 
                'Alert Received By': report.alert_received_by,
                'Alerted By': report.alerted_by, 
                'Alert Time': report.alert_time, 
                'Medical Support': report.medical_support, 
                'Doctor': report.name_of_doctor,
                'Nurse': report.name_of_nurse,
                'Ambulance Service': report.ambulance_service 
            });
    
            // Legal & Police Information - expanded
            createFullTable(doc, '3. Legal & Police Information', { 
                'Police Notified': report.police_notification, 
                'Police Station': report.police_station,
                'Reporting Time': report.reporting_time,
                'Legal Action': report.legal_action,
                'Legal Details': report.legal_details
            });
    
            // Chronological Events - added Action column
            const events = parseJSONSafely(report.chronological_events);
            if (events.length > 0) {
                addItemList('4. Chronological Events', events, event => `Time: ${event.time}, Description: ${event.description}, Action: ${event.action || 'N/A'}`);
            }
    
            // Witnesses - added Organization column
            const witnesses = parseJSONSafely(report.witnesses);
            if (witnesses.length > 0) {
                addItemList('5. Witnesses', witnesses, witness => 
                    `Name: ${witness.name}, Organization: ${witness.organization || 'N/A'}, Contact: ${witness.contact}, Action: ${witness.action || 'N/A'}`
                );
            }
    
            // Additional Details - added Status field
            createFullTable(doc, '6. Additional Details', {
                'Damage Details': report.damage_details,
                'Contributing Factors': report.contributing_factors,
                'Recommendations': report.recommendations,
                'Status of the Incident': report.status,
                'Follow-up Actions': report.follow_up_actions,
                'Additional Comments': report.additional_comments
            });
    
            // Submission Details
            createFullTable(doc, '7. Report Submission', {
                'Submitted By': report.submitted_by,
                'Designation': report.designation,
            });
    
            // Add incident image at the end of the PDF if available
            if (report.image_path) {
                // Force a new page for the image at the end
                doc.addPage();
                addIncidentImage(report.image_path);
            }
    
            // Optimized Footer without UID and page numbers
            const addFooter = () => {
                const totalPageCount = doc.bufferedPageRange().count;
                for (let i = 0; i < totalPageCount; i++) {
                    doc.switchToPage(i);
                    const bottomPosition = doc.page.height - 40;
                    doc.lineWidth(2).moveTo(40, bottomPosition - 10).lineTo(doc.page.width - 40, bottomPosition - 10).stroke(colors.primary);
                    
                    // No UID or page numbers - just the line
                }
            };
    
            // Add footers first
            addFooter();
            
            // Now add watermarks on top of everything
            pageRefs.forEach(pageRef => {
                addWatermarkToPage(pageRef);
            });
    
            doc.end();
    
            writeStream.on("finish", () => {
                res.download(reportPath, (err) => {
                    if (err) console.error("Download error:", err);
                    // Delete the file after download
                    setTimeout(() => fs.unlink(reportPath, (unlinkErr) => {
                        if (unlinkErr) console.error("File deletion error:", unlinkErr);
                    }), 2000);
                });
            });
        } catch (error) {
            console.error("PDF Generation Error:", error);
            res.status(500).send("Internal Server Error");
        }
    });
module.exports = router;
