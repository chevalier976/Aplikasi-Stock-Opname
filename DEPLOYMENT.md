# Deployment Instructions

## After Pulling Latest Changes

### 1. Update Google Apps Script (REQUIRED)

After pulling the latest changes from this repository, you **MUST** update and redeploy your Google Apps Script:

1. Open your Google Sheets (Stock Opname Database)
2. Click **Extensions** > **Apps Script**
3. **Select all code** in the editor and **delete it**
4. Copy the **entire contents** of `google-apps-script.js` from this repository
5. Paste it into the Apps Script editor
6. Click **Save** (💾 disk icon)
7. Click **Deploy** > **Manage deployments**
8. Click the **pencil icon** (✏️) next to your active deployment
9. Change **Version** to **"New version"**
10. Click **Deploy**
11. The Web app URL remains the same - no frontend changes needed

### 2. Frontend Changes

Frontend changes are automatically deployed when you:
- Run `npm run build` for production
- Or `npm run dev` for development

## Recent Changes

### Latest Update (Current)
- ✅ Fixed CORS error by using `Content-Type: text/plain`
- ✅ Changed timestamp format to "dd MMM yyyy" (e.g., "16 Feb 2026")
- ✅ Refactored Google Apps Script for better code structure

## Verification

To verify the deployment worked:

1. Start the app: `npm run dev`
2. Login with test credentials
3. Scan/enter a location code
4. Enter quantities and save
5. Check the history page - timestamps should be in "dd MMM yyyy" format
6. Check the Google Sheets "StockOpname" tab - new entries should appear

## Troubleshooting

### "Still getting CORS error"
- Make sure you **redeployed** the Apps Script (steps above)
- Clear browser cache
- Try in incognito/private mode

### "Data not saving"
- Check Apps Script **Executions** log (clock icon in Apps Script editor)
- Verify you redeployed with "New version"
- Make sure sheet names are: `Users`, `Products`, `StockOpname` (case-sensitive)

### "Timestamp shows old format"
- Hard refresh the browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Clear browser cache
- Restart the development server

## Need Help?

If you're still having issues:
1. Check the Apps Script execution logs
2. Check browser console for errors (F12 → Console tab)
3. Verify environment variables in `.env.local`
