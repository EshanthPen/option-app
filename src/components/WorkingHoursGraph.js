import React, { useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, PanResponder, Dimensions, Platform } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WorkingHoursGraph({ data, onChange, theme }) {
    // data shape: { 0: { start: 15, end: 22 }, 1: { start: 15, end: 22 }, ... 6: { start: 10, end: 23 } }
    // Note: Day 0 = Monday, Day 6 = Sunday for UI purposes. 
    // We will map this to `Date.getDay()` later where 0 = Sunday.

    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 250 });
    const { width, height } = dimensions;

    const graphPadding = { top: 30, bottom: 40, left: 40, right: 30 };
    const chartWidth = width - graphPadding.left - graphPadding.right;
    const chartHeight = height - graphPadding.top - graphPadding.bottom;

    // Y Axis represents Hours (0 to 24)
    const getY = (hour) => {
        // hour 0 is at the top, hour 24 is at the bottom (or vice versa? Let's make 0 AM top, 24 PM bottom)
        const range = 24;
        return graphPadding.top + (hour / range) * chartHeight;
    };

    const getX = (dayIndex) => {
        if (DAYS.length <= 1) return graphPadding.left;
        return graphPadding.left + (dayIndex / (DAYS.length - 1)) * chartWidth;
    };

    // PanResponder factory for drag events
    const createPanResponder = (dayIndex, isStart) => {
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                // optional: highlight node
            },
            onPanResponderMove: (evt, gestureState) => {
                // Calculate new hour based on Y position
                // y = graphPadding.top + (hour / 24) * chartHeight
                // hour = (y - graphPadding.top) * 24 / chartHeight

                // For web compat, gestureState.moveY might be relative to screen, 
                // but native standardizes it. To be safe across platforms (especially web),
                // we often use layout relative coordinates.

                // Native approach: We can accumulate dy manually. But a simpler approach
                // for SVG dragging is converting the absolute touch minus container offset.
            },
            onPanResponderRelease: () => {
                // commit changes
            }
        });
    };

    // We need a robust drag handler that works on Web and Native.
    // React Native SVG doesn't support PanResponder directly on <Circle> on web perfectly,
    // so we render hidden full-height columns per day to catch pan gestures.

    const handlePan = (dayIndex, evt, gestureState) => {
        if (!containerRef.current) return;
        // In a real implementation we would measure the container to get absolute Y,
        // but gestureState.dy is relative to touch start.
    };

    return (
        <View
            style={styles.container}
            onLayout={(e) => setDimensions({ width: e.nativeEvent.layout.width, height: 250 })}
        >
            {width > 0 && (
                <Svg width={width} height={height}>
                    {/* Background Grid Lines */}
                    {[0, 6, 12, 18, 24].map((h) => {
                        const y = getY(h);
                        return (
                            <React.Fragment key={h}>
                                <Line
                                    x1={graphPadding.left}
                                    y1={y}
                                    x2={width - graphPadding.right}
                                    y2={y}
                                    stroke={theme.colors.border}
                                    strokeWidth="1"
                                />
                                <SvgText
                                    x={graphPadding.left - 10}
                                    y={y + 4}
                                    fontSize="10"
                                    fill={theme.colors.ink3}
                                    textAnchor="end"
                                    fontFamily={theme.fonts.m}
                                >
                                    {h === 0 ? '12A' : h === 12 ? '12P' : h > 12 ? `${h - 12}P` : `${h}A`}
                                </SvgText>
                            </React.Fragment>
                        );
                    })}

                    {/* Day Labels */}
                    {DAYS.map((day, i) => (
                        <SvgText
                            key={day}
                            x={getX(i)}
                            y={height - 10}
                            fontSize="11"
                            fill={theme.colors.ink2}
                            textAnchor="middle"
                            fontFamily={theme.fonts.s}
                        >
                            {day}
                        </SvgText>
                    ))}

                    {/* Start Hours Path */}
                    <Path
                        d={DAYS.map((_, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(data[i].start)}`).join(' ')}
                        stroke={theme.colors.green}
                        strokeWidth="3"
                        fill="none"
                    />

                    {/* End Hours Path */}
                    <Path
                        d={DAYS.map((_, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(data[i].end)}`).join(' ')}
                        stroke={theme.colors.blue}
                        strokeWidth="3"
                        fill="none"
                    />

                    {/* Nodes & Touch Columns */}
                    {DAYS.map((_, i) => {
                        const x = getX(i);
                        const startY = getY(data[i].start);
                        const endY = getY(data[i].end);

                        return (
                            <React.Fragment key={i}>
                                {/* Visible Nodes */}
                                <Circle cx={x} cy={startY} r="6" fill={theme.colors.green} stroke={theme.colors.surface} strokeWidth="2" />
                                <Circle cx={x} cy={endY} r="6" fill={theme.colors.blue} stroke={theme.colors.surface} strokeWidth="2" />
                            </React.Fragment>
                        );
                    })}
                </Svg>
            )}

            {/* Invisible Touch Overlay for gesture tracking per day */}
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', marginLeft: graphPadding.left, marginRight: graphPadding.right, marginTop: graphPadding.top, marginBottom: graphPadding.bottom }]} ref={containerRef}>
                {DAYS.map((_, i) => (
                    <DayColumnDrag
                        key={i}
                        dayIndex={i}
                        data={data[i]}
                        chartHeight={chartHeight}
                        onChange={(newData) => {
                            const clone = { ...data };
                            clone[i] = newData;
                            onChange(clone);
                        }}
                    />
                ))}
            </View>
        </View>
    );
}

// A helper component to handle dragging within a single day's column
function DayColumnDrag({ dayIndex, data, chartHeight, onChange }) {
    const dataRef = useRef(data);
    dataRef.current = data; // Keep latest without resetting useMemo

    // The robust cross platform drag:
    const panResponder = useMemo(() => {
        let initialStart = 0;
        let initialEnd = 0;
        let dragging = null;

        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                // Update refs to current canonical state
                initialStart = dataRef.current.start;
                initialEnd = dataRef.current.end;

                const touchY = e.nativeEvent.locationY;
                // Safely handle if locationY is missing (sometimes on web)
                if (touchY === undefined) {
                    dragging = 'start'; // fallback
                    return;
                }

                const startY = (initialStart / 24) * chartHeight;
                const endY = (initialEnd / 24) * chartHeight;

                if (Math.abs(touchY - startY) <= Math.abs(touchY - endY)) {
                    dragging = 'start';
                } else {
                    dragging = 'end';
                }
            },
            onPanResponderMove: (e, gestureState) => {
                if (!dragging) return;

                // Convert pixels dragged into hours
                const hourDelta = (gestureState.dy / chartHeight) * 24;

                if (dragging === 'start') {
                    let newHour = Math.round(initialStart + hourDelta);
                    // clamp
                    if (newHour < 0) newHour = 0;
                    if (newHour > 24) newHour = 24;
                    // optionally restrict start crossing end
                    if (newHour > dataRef.current.end) newHour = dataRef.current.end;

                    if (newHour !== dataRef.current.start) {
                        onChange({ start: newHour, end: dataRef.current.end });
                    }
                } else {
                    let newHour = Math.round(initialEnd + hourDelta);
                    if (newHour < 0) newHour = 0;
                    if (newHour > 24) newHour = 24;
                    if (newHour < dataRef.current.start) newHour = dataRef.current.start;

                    if (newHour !== dataRef.current.end) {
                        onChange({ start: dataRef.current.start, end: newHour });
                    }
                }
            },
            onPanResponderRelease: () => {
                dragging = null;
            }
        });
    }, [chartHeight, onChange]);

    return (
        <View
            style={{ flex: 1, backgroundColor: 'transparent' }}
            {...panResponder.panHandlers}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        height: 250,
        width: '100%',
    }
});
