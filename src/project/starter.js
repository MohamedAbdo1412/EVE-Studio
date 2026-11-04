export const STARTER_SOURCE = `<app
    name="EVE Room Monitor"
    width="800"
    height="480"
    scale="fit"
    background="#101820"
>

    <vars>
        <fam name="page12">
            <fam name="room12">
                <var name="temperature" type="number" value="30" />
                <var name="color" type="color" value="#00FF88" />
                <var name="enabled" type="boolean" value="true" />
                <var name="roomName" type="string" value="Living Room" />
                <var name="icon" type="image" value="assets/room-icon.png" />
            </fam>
        </fam>
    </vars>

    <page
        id="home"
        title="Room Monitor"
        initial="true"
        background="#101820"
    >
        <shape
            id="header-band"
            type="rect"
            x="0"
            y="0"
            width="800"
            height="76"
            fill="#141F2E"
        />

        <text
            id="room-name"
            x="34"
            y="22"
            width="420"
            height="44"
            fontSize="30"
            weight="bold"
            color="#FFFFFF"
        >
            \${page12.room12.roomName}
        </text>

        <img
            id="room-icon"
            x="714"
            y="18"
            width="40"
            height="40"
            src="\${page12.room12.icon}"
            fit="contain"
            radius="8"
        />

        <shape
            id="temperature-card"
            type="roundRect"
            x="30"
            y="110"
            width="350"
            height="190"
            fill="#23364A"
            radius="14"
        />

        <text
            id="temperature-value"
            x="50"
            y="132"
            width="310"
            height="105"
            color="\${page12.room12.color}"
            fontSize="58"
            weight="bold"
            align="center"
            verticalAlign="middle"
        >
            \${page12.room12.temperature}°C
        </text>

        <text
            id="temperature-caption"
            x="50"
            y="244"
            width="310"
            height="36"
            fontSize="16"
            color="#8DA4BD"
            align="center"
        >
            LIVE SENSOR · ROOM 12
        </text>

        <text
            id="cooling-status"
            x="50"
            y="320"
            width="340"
            height="42"
            fontSize="19"
            weight="bold"
            color="\${page12.room12.enabled ? '#00FF88' : '#FFB454'}"
        >
            \${page12.room12.enabled ? 'COOLING ENABLED' : 'COOLING DISABLED'}
        </text>

        <shape
            id="status-dot"
            type="circle"
            x="32"
            y="331"
            width="12"
            height="12"
            fill="\${page12.room12.enabled ? '#00FF88' : '#FFB454'}"
            visible="\${page12.room12.enabled}"
        />

        <button
            id="toggle-cooling"
            x="430"
            y="120"
            width="320"
            height="58"
            background="#2455AA"
            radius="9"
            onPress="toggle(page12.room12.enabled)"
        >
            <text
                id="toggle-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                fontSize="17"
                weight="bold"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Toggle Cooling
            </text>
        </button>

        <button
            id="open-settings"
            x="430"
            y="198"
            width="320"
            height="58"
            background="#2C3C50"
            borderColor="#465D78"
            borderWidth="1"
            radius="9"
            onPress="navigate('settings')"
        >
            <text
                id="settings-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                fontSize="17"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Open Settings
            </text>
        </button>

        <shape
            id="history-rule"
            type="line"
            x="430"
            y="292"
            width="320"
            height="2"
            stroke="#33465A"
            strokeWidth="1"
        />

        <text
            id="runtime-note"
            x="430"
            y="315"
            width="320"
            height="58"
            fontSize="13"
            color="#71879D"
            wrap="true"
        >
            Runtime variables update this scene without recompiling. Open the inspector to edit them.
        </text>
    </page>

    <page
        id="settings"
        title="Settings"
        background="#131D2B"
    >
        <text
            id="settings-title"
            x="30"
            y="28"
            width="560"
            height="54"
            fontSize="32"
            weight="bold"
            color="#FFFFFF"
        >
            Room Settings
        </text>

        <text
            id="settings-subtitle"
            x="30"
            y="82"
            width="560"
            height="32"
            fontSize="15"
            color="#8DA4BD"
        >
            Changes are applied to the running scene immediately.
        </text>

        <shape
            id="settings-card"
            type="roundRect"
            x="30"
            y="130"
            width="510"
            height="140"
            fill="#1B2A3B"
            stroke="#2C4158"
            strokeWidth="1"
            radius="12"
        />

        <text
            id="current-temperature"
            x="52"
            y="148"
            width="440"
            height="46"
            fontSize="24"
            color="\${page12.room12.color}"
        >
            Current temperature: \${page12.room12.temperature}°C
        </text>

        <text
            id="settings-status"
            x="52"
            y="204"
            width="440"
            height="36"
            fontSize="16"
            color="#8DA4BD"
        >
            Cooling: \${page12.room12.enabled ? 'on' : 'off'}
        </text>

        <button
            id="increase-temperature"
            x="30"
            y="300"
            width="180"
            height="55"
            background="#246B52"
            radius="8"
            onPress="set(page12.room12.temperature, page12.room12.temperature + 1)"
        >
            <text
                id="increase-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Increase
            </text>
        </button>

        <button
            id="decrease-temperature"
            x="230"
            y="300"
            width="180"
            height="55"
            background="#884444"
            radius="8"
            onPress="set(page12.room12.temperature, page12.room12.temperature - 1)"
        >
            <text
                id="decrease-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Decrease
            </text>
        </button>

        <button
            id="return-home"
            x="30"
            y="385"
            width="180"
            height="55"
            background="#2455AA"
            radius="8"
            onPress="back()"
        >
            <text
                id="back-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Back
            </text>
        </button>

        <button
            id="reset-temperature"
            x="230"
            y="385"
            width="180"
            height="55"
            background="#35475C"
            radius="8"
            onPress="reset(page12.room12.temperature)"
        >
            <text
                id="reset-label"
                x="0"
                y="0"
                width="100%"
                height="100%"
                color="#FFFFFF"
                align="center"
                verticalAlign="middle"
            >
                Reset Value
            </text>
        </button>
    </page>

</app>
`;
