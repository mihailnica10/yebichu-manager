# MetaTrader 5 GUI Automation Reference

> Compiled from official MT5 help, pywinauto community projects, MQL5 docs, and Wine/automation community knowledge.

---

## 1. Complete Keyboard Shortcut Table

### 1.1 Global Application Shortcuts

| Keys | Action |
|---|---|
| **Ctrl+N** | New chart |
| **Ctrl+O** | Open an account |
| **Ctrl+W** | Close current chart |
| **F4** | Open MetaEditor (MQL5 IDE) |
| **F6** | Open Strategy Tester |
| **F7** | Compile current EA/indicator |
| **Ctrl+F6** | Start/Stop test in Strategy Tester |
| **Ctrl+F9** | Open mailbox |
| **Ctrl+T** | Open/close Toolbox (trade terminal) |
| **Ctrl+M** | Open/close Market Watch |
| **Ctrl+Y** | Open/close Depth of Market (tick chart) |
| **Ctrl+D** | Open/close Data window |
| **Ctrl+S** | Save chart screenshot |
| **Ctrl+P** | Print chart |
| **Ctrl+F** | Search |
| **F1** | Help |
| **Delete** | Remove selected broker/server from list |
| **F9** | New Order |
| **Ctrl+9** | One-click trading toggle |

### 1.2 Alt+Letter Accelerator Keys (Menu Navigation)

| Sequence | Action |
|---|---|
| **Alt+F** | Open **File** menu |
| **Alt+F → N** | New Chart |
| **Alt+F → O** | Open an Account |
| **Alt+F → L** | Login to Trade Account |
| **Alt+F → S** | Save |
| **Alt+F → C** | Close |
| **Alt+V** | Open **View** menu |
| **Alt+V → T** | Toolbars |
| **Alt+V → M** | Market Watch |
| **Alt+V → D** | Data Window |
| **Alt+V → T** | Toolbox |
| **Alt+V → G** | Navigator |
| **Alt+I** | Open **Insert** menu |
| **Alt+I → I** | Indicators |
| **Alt+I → L** | Lines |
| **Alt+I → E** | Expert Advisor |
| **Alt+C** | Open **Charts** menu |
| **Alt+C → T** | Timeframes |
| **Alt+C → G** | Grid (toggle) |
| **Alt+T** | Open **Tools** menu |
| **Alt+T → O** | Options |
| **Alt+T → H** | History Center |
| **Alt+W** | Open **Window** menu |
| **Alt+H** | Open **Help** menu |

### 1.3 Chart Navigation

| Keys | Action |
|---|---|
| **F8** | Chart settings / Object properties |
| **F12** | Move chart forward in time |
| **← / →** | Scroll chart left/right |
| **Ctrl+↑ / Ctrl+↓** | Zoom in / Zoom out |
| **+ / -** | Zoom in / Zoom out |
| **Home** | Go to chart beginning |
| **End** | Go to chart end |
| **Alt+1/2/3/4** | Chart style: Bar/Candle/Line/Area |
| **Ctrl+1/2/3** | Timeframe shortcuts |
| **Ctrl+Shift+F** | Fast Navigation bar |

---

## 2. "Open an Account" Dialog — Step by Step

### 2.1 How to Open

- **Keyboard:** `Ctrl+O` or `Alt+F → O`
- **pywinauto:** `app['WindowTitle'].menu_select("File->Open an Account")`
- **Dialog type:** Modal — blocks interaction with main window until closed

### 2.2 Step-by-Step Flow

#### Step 1: Server Selection

| Control | Type | Navigation |
|---|---|---|
| Search field | Edit (TextBox) at top | `Tab` to focus, type broker name |
| Server list | ListView / ListBox | `Up` / `Down` arrows after filter |
| "Next >" button | Button | `Enter` or click |

**Pattern:**
```python
dlg = Desktop(backend="win32").window(title="Open an Account")
dlg.Edit.type_keys("BrokerName")
time.sleep(1.5)  # Wait for filter debounce
dlg.ListBox.type_keys("{DOWN}{ENTER}")  # Select + Next
```

**Notes:** List filters live as you type. `Delete` key removes a broker.

#### Step 2: Account Type

Three radio options:
- **"Open a demo account"** — creates demo; go to Step 3
- **"Connect to an existing trading account"** — redirects to Login flow
- **"Open a real account for live trading"** — extended form

**Pattern:**
```python
dlg.RadioButton.click()  # Select demo option
# Wait for form transition
time.sleep(1.5)
dlg.NextButton.click()
```

#### Step 3: Personal Details

| Field | Type | Notes |
|---|---|---|
| First name | Edit | Min 2 chars |
| Second name (Surname) | Edit | Min 2 chars |
| Email | Edit | e.g. `john@example.com` |
| Phone | Edit | International format `+1234567890` |
| Use hedge in trading | CheckBox | Enables hedging |
| Account Type | ComboBox | Broker-defined |
| Deposit | ComboBox | Initial deposit amount |
| Currency | Static (read-only) | Set by account type |
| Leverage | ComboBox | e.g. `1:100`, `1:500` |
| Agreement checkboxes | CheckBox | Must tick to proceed |

**Pattern:**
```python
dlg.Edit1.type_keys("John")
dlg.Edit2.type_keys("Doe")
dlg.Edit3.type_keys("john@example.com")
dlg.Edit4.type_keys("+1234567890")
dlg.ComboBox3.select("1:500")  # Leverage
dlg.CheckBox.check()           # Agreement tick
dlg.NextButton.click()
```

#### Step 4: Registration Confirmation

| Field | Type | Value |
|---|---|---|
| Login | Static | Generated account number |
| Password | Edit (read-only) | Master password |
| Investor | Edit (read-only) | Investor (read-only) password |
| QR code | Image | For mobile sign-in |
| **Finish** | Button | Connects + adds to Navigator |
| **Cancel** | Button | Account created but NOT added to Navigator |

**Critical:** Clicking `Cancel` creates the account on the server but does not connect to it or add it to the Navigator window. To connect later, you must use "Login to Trade Account" with the displayed credentials.

**Pattern:**
```python
# Extract credentials before clicking Finish
login = dlg.Static1.texts()[0]
password = dlg.Edit1.texts()[0]
dlg.FinishButton.click()
time.sleep(5)  # Wait for server connection
```

---

## 3. "Login to Trade Account" Dialog — Step by Step

### 3.1 How to Open

- **Keyboard:** `Alt+F → L` or Enter on account in Navigator
- **pywinauto:** `app['WindowTitle'].menu_select("File->Login to Trade Account")`
- **Dialog type:** Modal

### 3.2 Fields

| Field | Type | Notes |
|---|---|---|
| **Login** | Edit | Account number |
| **Password** | Edit (password mask) | Master or investor password |
| **Server** | ComboBox / Edit | `ServerName` or `IP:Port` |
| **Save password** | CheckBox | Auto-connect on next launch |
| **OK** | Button | Submit |
| **Cancel** | Button | Close |

### 3.3 Complete Login Flow

```python
dlg = Desktop().window(title="Login to Trade Account")
dlg.Edit1.type_keys("123456")
dlg.Edit2.type_keys("MyP@ssword")
# Server usually pre-filled; can type to override
dlg.ComboBox.type_keys("MyBroker-Demo")
dlg.CheckBox.check()  # Save password
dlg.OK.click()
time.sleep(5)  # Wait for connection
```

### 3.4 Forced Password Change

If the server requires it, a secondary dialog appears:

```python
change_dlg = Desktop().window(title="Change Password")
if change_dlg.exists():
    change_dlg.Edit1.type_keys("NewP@ss123")
    change_dlg.Edit2.type_keys("NewP@ss123")
    change_dlg.OK.click()
    time.sleep(3)
```

**Password requirements:** Must contain uppercase, lowercase, number, and special character; must differ from previous.

---

## 4. Recommended Delay/Wait Patterns

### 4.1 Timing Table

| Operation | Recommended Delay |
|---|---|
| After app launch → main window ready | 3-5s |
| After `menu_select` → dialog visible | 1-2s |
| After `Next` in wizard (server round-trip) | 2-4s |
| After typing in search (list filter) | 0.5-1.5s |
| After `Finish` / `OK` (server connect) | 3-5s |
| Between consecutive key presses | 0.02-0.1s |
| After button click (UI render) | 0.5-1s |

### 4.2 Dynamic Wait (Recommended)

```python
from pywinauto.timings import wait_until

def safe_click(button, wait_for_title=None, timeout=15):
    button.click()
    if wait_for_title:
        wait_until(timeout, 0.5,
                   lambda: Desktop().window(title=wait_for_title).exists())
    else:
        time.sleep(1.5)

# Usage
safe_click(dlg.NextButton, "Open an Account")
```

### 4.3 Wine/Linux Multiplier

When running under Wine, increase all delays by **1.5-2x**. MT5 on Wine is noticeably slower at rendering and server communication.

---

## 5. How to Check If a Dialog Is Open

### 5.1 pywinauto

```python
from pywinauto import Desktop
from pywinauto.findwindows import find_window

# Check existence
dlg = Desktop(backend="win32").window(title="Open an Account")
if dlg.exists():
    dlg.set_focus()

# Check visibility
if dlg.is_visible():
    print("Dialog visible")

# Wait for open
dlg.wait("visible", timeout=10)

# Wait for close
dlg.wait_not("visible", timeout=30)

# Check if main window is modal-blocked
main = app.window(title_re=".*MetaTrader.*")
if not main.is_enabled():
    print("Modal dialog blocking main window")
```

### 5.2 Robust Wine Detection

```python
# Wine may encode titles differently
windows = Desktop(backend="win32").windows()
for w in windows:
    txt = w.window_text()
    if "Login" in txt and "Account" in txt:
        print(f"Found: {txt}")
```

---

## 6. Common Pitfalls & How to Avoid Them

### 6.1 Modal Dialog Blocking

**Problem:** Menu actions on main window fail silently or hang when a modal dialog is open.

**Fix:** Always check for existing dialogs first:
```python
for title in ["Open an Account", "Login to Trade Account", "Change Password"]:
    d = Desktop().window(title=title)
    if d.exists():
        d.close()
        time.sleep(0.5)
```

### 6.2 Window Title Changes After Login

**Problem:** Title changes from `"MetaTrader 5"` to `"{AccountNum} - {Server}: {Type}"`.

**Fix:** Use regex to match either:
```python
app = Application().connect(title_re=".*MetaTrader.*|.*-.*:.*")
```

### 6.3 Wine/Linux Known Issues

| Issue | Workaround |
|---|---|
| Mouse click offset (several cm off) | Use keyboard navigation only |
| Color picker broken | `Alt+Down` after double-clicking color square |
| Window title encoding | Use `title_re` with broad patterns |
| Mono/Gecko missing | Install when Wine prompts |
| General slowness | 1.5-2x delay multiplier |
| `menu_select` failure | Fall back to `Alt+F → O` keyboard sequence |

### 6.4 Race Conditions with Server

**Bad:**
```python
dlg.NextButton.click()
dlg.Edit1.type_keys("John")  # UI not ready!
```

**Good:**
```python
dlg.NextButton.click()
wait_until(15, 0.5, lambda: dlg.Edit1.is_visible())
dlg.Edit1.type_keys("John")
```

### 6.5 Launch with /portable

Avoids `%APPDATA%` permission issues and makes path handling predictable:
```python
subprocess.Popen([
    r"C:\MT5\terminal64.exe",
    "/config:config.ini",
    "/portable"
])
```

### 6.6 Multiple Instances

Connect by PID to avoid title ambiguity:
```python
proc = subprocess.Popen([mt5_exe, "/portable"])
app = Application().connect(process=proc.pid)
```

### 6.7 UAC / Admin Rights

On Windows, disable MT5 auto-update or run your automation as Administrator.

### 6.8 Extended Authentication

Some brokers use SSL certificates for login. Ensure the certificate is installed in the OS store before automation starts.

---

## 7. Launch Flags Summary

| Flag | Purpose |
|---|---|
| `/portable` | Portable mode (data in app directory) |
| `/config:<path>` | Use specified config file |
| `/account:<number>` | Auto-connect to account |
| `/login` | Show login dialog on startup |
| `/skipupdate` | Skip auto-update check |

---

## 8. Complete pywinauto Automation Template

```python
from pywinauto.application import Application
from pywinauto import Desktop
from pywinauto.timings import wait_until
import subprocess, time

# Launch MT5
proc = subprocess.Popen([
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    "/portable"
])
time.sleep(5)

# Connect
app = Application(backend="win32").connect(process=proc.pid)
main = app.window(title_re=".*MetaTrader.*")

# --- Open an Account ---
main.menu_select("File->Open an Account")
time.sleep(2)

oa = Desktop(backend="win32").window(title="Open an Account")
oa.set_focus()

# Step 1: Server
oa.Edit.type_keys("BrokerName")
time.sleep(1.5)
oa.ListBox.type_keys("{DOWN}{ENTER}")
time.sleep(3)

# Step 2: Account type (already selected Demo)
oa.NextButton.click()
time.sleep(2)

# Step 3: Personal details
oa.Edit1.type_keys("John")
oa.Edit2.type_keys("Doe")
oa.Edit3.type_keys("john@example.com")
oa.Edit4.type_keys("+1234567890")
oa.ComboBox3.select("1:500")
oa.CheckBox.check()
oa.NextButton.click()
time.sleep(3)

# Step 4: Confirmation — save credentials
login = oa.Static1.texts()[0]
password = oa.Edit1.texts()[0]
print(f"Account {login} created. Password: {password}")
oa.FinishButton.click()
time.sleep(5)

# --- Login to Trade Account ---
main.menu_select("File->Login to Trade Account")
time.sleep(2)

login_dlg = Desktop().window(title="Login to Trade Account")
login_dlg.Edit1.type_keys("12345")
login_dlg.Edit2.type_keys("mypassword")
login_dlg.OK.click()
time.sleep(5)
```
