# syntax=docker/dockerfile:1
FROM debian:12-slim AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV WINEPREFIX=/config/.wine
ENV WINEDEBUG=fixme-all,err-all
ENV VNC_GEOMETRY=1280x720
ENV WINEARCH=win64
ENV MT5_DIR="/config/.wine/drive_c/Program Files/MetaTrader 5"
ENV XDG_CURRENT_DESKTOP=XFCE
ENV XDG_SESSION_TYPE=x11

# Layer 1: System packages (stable, rarely changes)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    tigervnc-standalone-server tigervnc-common \
    websockify \
    xfce4-panel xfce4-session xfdesktop4 xfwm4 \
    xfce4-whiskermenu-plugin \
    dbus dbus-x11 \
    xauth x11-xserver-utils xfonts-base \
    python3 python3-pip python3-numpy \
    xdotool procps psmisc \
    curl ca-certificates xdg-utils xvfb cabextract \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Filebrowser (pinned to v2.28.0 for reproducibility)
RUN curl -sL https://github.com/filebrowser/filebrowser/releases/download/v2.28.0/linux-amd64-filebrowser.tar.gz \
    | tar xz -C /usr/local/bin/ filebrowser && chmod +x /usr/local/bin/filebrowser

# Layer 3: Wine (pinned to 10.0, changes ~yearly)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    mkdir -pm755 /etc/apt/keyrings && \
    curl -sL -o /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    curl -sL -o /etc/apt/sources.list.d/winehq-bookworm.sources https://dl.winehq.org/wine-builds/debian/dists/bookworm/winehq-bookworm.sources && \
    dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        wine-stable-i386=10.0.0.0~bookworm-1 \
        wine-stable-amd64=10.0.0.0~bookworm-1 \
        wine-stable=10.0.0.0~bookworm-1 \
        winehq-stable=10.0.0.0~bookworm-1 \
    && rm -rf /var/lib/apt/lists/* /etc/apt/keyrings/winehq-archive.key

# Layer 4: Pre-download Wine Mono + winetricks (installed at runtime on first boot)
RUN curl -fsSL -o /usr/bin/winetricks \
      https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks && \
    chmod +x /usr/bin/winetricks

ARG WINE_MONO_VERSION=11.1.0
RUN curl -fsSL -o /tmp/wine-mono-x86.msi \
    https://dl.winehq.org/wine/wine-mono/${WINE_MONO_VERSION}/wine-mono-${WINE_MONO_VERSION}-x86.msi

COPY init-wine.sh /usr/local/bin/init-wine.sh
RUN chmod +x /usr/local/bin/init-wine.sh

# Layer 5: Python deps (changes when we add/remove packages)
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip3 install --break-system-packages --no-cache-dir \
    mt5linux rpyc pyxdg \
    fastapi uvicorn pydantic \
    pywinauto minio

# Layer 5: App config files (.desktop launchers, panel layout)
RUN mkdir -p /usr/share/applications && \
    cat > /usr/share/applications/mt5.desktop << 'MT5EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=MetaTrader 5
Comment=MT5 Trading Terminal
Exec=wine "Z:\config\.wine\drive_c\Program Files\MetaTrader 5\terminal64.exe" /portable /withdrawal:disabled
Icon=terminal64
Terminal=false
Categories=Finance;
MT5EOF
RUN mkdir -p /etc/mt5 && \
    cat > /etc/mt5/mt5cfg.ini << 'MT5CFG'
[Common]
NewsEnable=0
Profile=Blank
ProxyEnable=0
[Charts]
MaxBars=1000000
SelectOneClick=1
[Experts]
Enabled=1
Account=0
Profile=0
Chart=0
Api=0
[Events]
Enable=0
NewsEnable=0
MT5CFG
RUN cat > /usr/share/applications/filebrowser.desktop << 'FBEOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=File Browser
Comment=MQL5 File Manager
Exec=xdg-open http://localhost:8080
Icon=folder
Terminal=false
Categories=Utility;
FBEOF
RUN mkdir -p /etc/xdg/xfce4/panel && \
    cat > /etc/xdg/xfce4/panel/default.xml << 'PANLEOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-panel" version="1.0">
  <property name="panels" type="array">
    <value type="int" value="1"/>
  </property>
  <property name="panel-1" type="empty">
    <property name="position" type="string" value="p=6;x=0;y=0"/>
    <property name="length" type="uint" value="100"/>
    <property name="position-locked" type="bool" value="true"/>
    <property name="size" type="uint" value="32"/>
    <property name="plugin-ids" type="array">
      <value type="int" value="1"/>
      <value type="int" value="2"/>
      <value type="int" value="3"/>
      <value type="int" value="4"/>
      <value type="int" value="5"/>
      <value type="int" value="6"/>
      <value type="int" value="7"/>
    </property>
  </property>
  <property name="plugins" type="empty">
    <property name="plugin-1" type="string" value="whiskermenu"/>
    <property name="plugin-2" type="string" value="launcher">
      <property name="items" type="array">
        <value type="string" value="mt5.desktop"/>
      </property>
    </property>
    <property name="plugin-3" type="string" value="launcher">
      <property name="items" type="array">
        <value type="string" value="filebrowser.desktop"/>
      </property>
    </property>
    <property name="plugin-4" type="string" value="tasklist">
      <property name="grouping" type="uint" value="0"/>
    </property>
    <property name="plugin-5" type="string" value="separator">
      <property name="expand" type="bool" value="true"/>
    </property>
    <property name="plugin-6" type="string" value="systray"/>
    <property name="plugin-7" type="string" value="clock">
      <property name="digital-format" type="string" value="%H:%M"/>
    </property>
  </property>
</channel>
PANLEOF

# Layer 6: Entrypoint (changes most often — ALL LAYERS ABOVE ARE CACHED)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DEBIAN_FRONTEND=

EXPOSE 5901 6080 8080 8090
CMD ["/entrypoint.sh"]
