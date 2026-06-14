#define MyAppName "Simple Image Panel"
#define MyAppVersion GetEnv("APP_VERSION")
#define MyAppPublisher "CuiMuxuan"
#define MyAppURL "https://github.com/CuiMuxuan/image-simple-panel"
#define MyAppExeName "image-simple-panel.exe"
#define SourceDir "..\release\ImageSimplePanel"

[Setup]
AppId={{9DA38C4C-3BA6-4EE0-B891-7C918453706E}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Simple Image Panel
DefaultGroupName=Simple Image Panel
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=..\release
OutputBaseFilename=image-simple-panel-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Simple Image Panel"; Filename: "{app}\{#MyAppExeName}"
Name: "{commondesktop}\Simple Image Panel"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,Simple Image Panel}"; Flags: nowait postinstall skipifsilent
