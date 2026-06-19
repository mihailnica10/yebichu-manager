# syntax=docker/dockerfile:1
FROM debian:12-slim AS base

LABEL org.opencontainers.image.title="yebichu MetaTrader 5 Algo Trading"
LABEL org.opencontainers.image.description="Docker-based MT5 trading platform with Xvnc + Xfce4 + Wine + Python bridge"
LABEL org.opencontainers.image.version="1.0.0"

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV WINEPREFIX=/config/.wine
ENV WINEDEBUG=-all
ENV VNC_GEOMETRY=1280x720
ENV WINEARCH=win64
ENV MT5_DIR="/config/.wine/drive_c/Program Files/MetaTrader 5"
ENV XDG_CURRENT_DESKTOP=XFCE
ENV XDG_SESSION_TYPE=x11
ENV WINEDLLOVERRIDES="mscoree=,mshtml=,ucrtbase=n"

# Layer 1: System packages (stable, rarely changes)
# x11-utils provides xprop; wmctrl may not exist in all versions
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    tigervnc-standalone-server tigervnc-common \
    websockify \
    xfce4-session xfdesktop4 xfwm4 \
    dbus dbus-x11 \
    xauth x11-xserver-utils xfonts-base \
    x11-utils \
    python3 python3-pip python3-numpy \
    xdotool procps psmisc \
    curl ca-certificates xdg-utils xvfb cabextract \
    && apt-get install -y --no-install-recommends wmctrl 2>/dev/null || true \
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

# Layer 4: Pre-download tools (cached until version bumps)
RUN curl -fsSL -o /usr/bin/winetricks \
      https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks && \
    chmod +x /usr/bin/winetricks

ARG WINE_MONO_VERSION=11.1.0
RUN curl -fsSL -o /tmp/wine-mono-${WINE_MONO_VERSION}-x86.msi \
    https://dl.winehq.org/wine/wine-mono/${WINE_MONO_VERSION}/wine-mono-${WINE_MONO_VERSION}-x86.msi

# Pre-download MT5 setup + Python for Windows (cached in layer)
ADD https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe /tmp/mt5setup.exe
ADD https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe /tmp/python-3.11.9-amd64.exe

COPY runtime/init-wine.sh /usr/local/bin/init-wine.sh
RUN chmod +x /usr/local/bin/init-wine.sh

# Layer 4.5: Pre-install MT5 and Python for Windows under Wine (build-time snapshot)
# Creates a temporary Wine prefix, installs everything, then exports the directories
# so runtime can copy them instantly instead of installing at first boot.
# Also pre-installs vcrun2019 and corefonts into /opt/wine-vcrun and /opt/wine-fonts
# so runtime init-wine.sh does NOT need to run winetricks (saves ~3-5 minutes).
COPY runtime/build-helper.sh /usr/local/bin/build-helper.sh
RUN chmod +x /usr/local/bin/build-helper.sh && /usr/local/bin/build-helper.sh

# Layer 5: Python deps for Linux (changes when we add/remove packages)
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip3 install --break-system-packages --no-cache-dir \
    mt5linux "rpyc>=6.0.0" "numpy>=2.0.0" pyxdg \
    fastapi uvicorn pydantic \
    pywinauto minio

# Layer 6: App config files (.desktop launchers, xfwm4 config, icons)
RUN mkdir -p /usr/share/applications && \
    cat > /usr/share/applications/mt5.desktop << 'MT5EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=MetaTrader 5
Comment=yebichu MT5 Trading Terminal
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

RUN mkdir -p /root/Desktop && \
    cp /usr/share/applications/mt5.desktop /root/Desktop/ && \
    chmod +x /root/Desktop/mt5.desktop

# Xfwm4 defaults: single workspace, no scroll, no wrap, Daloa theme, no compositing
RUN mkdir -p /etc/xdg/xfce4/xfconf/xfce-perchannel-xml && \
    cat > /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml << 'XFCONF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="scroll_workspaces" type="bool" value="false"/>
    <property name="workspace_count" type="int" value="1"/>
    <property name="wrap_cycle" type="bool" value="false"/>
    <property name="wrap_workspaces" type="bool" value="false"/>
    <property name="zoom_desktop" type="bool" value="false"/>
    <property name="theme" type="string" value="Daloa"/>
    <property name="use_compositing" type="bool" value="false"/>
  </property>
</channel>
XFCONF

# Pre-seed clean desktop icons config (only mt5.desktop, no File System / Home)
RUN mkdir -p /root/.config/xfce4/desktop && \
    cat > /root/.config/xfce4/desktop/icons.screen0.rc << 'ICONS'
[xfdesktop-version-4.10.3+-rcfile_format]
4.10.3+=true

[/root/Desktop/mt5.desktop]
row=0
col=0
ICONS

RUN ln -sf /root/.config/xfce4/desktop/icons.screen0.rc \
            /root/.config/xfce4/desktop/icons.screen.latest.rc

# Layer 7: Bridge scripts (changes with API code)
COPY scripts/mt5-bridge/ /mt5-bridge/

# Layer 8: Entrypoint (changes most often — ALL LAYERS ABOVE ARE CACHED)
COPY runtime/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DEBIAN_FRONTEND=

EXPOSE 5901 6080 8080 8090
CMD ["/entrypoint.sh"]
