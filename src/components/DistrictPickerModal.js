import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { Search, X, Check, Globe } from 'lucide-react-native';
import { theme as staticTheme } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';

export const KNOWN_DISTRICTS = [
    { id: 'fcps', name: 'Fairfax County Public Schools (VA)', url: 'https://sisstudent.fcps.edu' },
    { id: 'pwcs', name: 'Prince William County Public Schools (VA)', url: 'https://studentvue.pwcs.edu' },
    { id: 'lcps', name: 'Loudoun County Public Schools (VA)', url: 'https://student.lcps.org' },
    { id: 'bcps', name: 'Beaverton School District (OR)', url: 'https://studentvue.beaverton.k12.or.us' },
    { id: 'aps', name: 'Albuquerque Public Schools (NM)', url: 'https://mystudent.aps.edu' },
    { id: 'cps', name: 'Chesapeake Public Schools (VA)', url: 'https://siscps.cpschools.com' },
    { id: 'rcps', name: 'Roanoke County Public Schools (VA)', url: 'https://synergy.rcps.us' },
    { id: 'custom', name: 'Other (Enter Custom URL)', url: 'custom' },
];

export default function DistrictPickerModal({ visible, onClose, onSelect, currentSelectionUrl }) {
    const { theme, isDarkMode } = useTheme();
    const styles = getStyles(theme);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredDistricts = useMemo(() => {
        if (!searchQuery) return KNOWN_DISTRICTS;
        const lowerQ = searchQuery.toLowerCase();
        return KNOWN_DISTRICTS.filter(d => d.name.toLowerCase().includes(lowerQ));
    }, [searchQuery]);

    const handleSelect = (district) => {
        onSelect(district);
        setSearchQuery('');
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.modalOverlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalContent}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Select Your School District</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={theme.colors.ink2} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchContainer}>
                        <Search size={20} color={theme.colors.ink3} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search for your county or district..."
                            placeholderTextColor={theme.colors.ink3}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus={false}
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                                <X size={16} color={theme.colors.ink3} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <FlatList
                        data={filteredDistricts}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContainer}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => {
                            const isSelected = currentSelectionUrl === item.url;
                            return (
                                <TouchableOpacity
                                    style={[styles.districtItem, isSelected && styles.districtItemSelected]}
                                    onPress={() => handleSelect(item)}
                                >
                                    <View style={styles.row}>
                                        <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                                            <Globe size={20} color={isSelected ? theme.colors.blue : theme.colors.ink3} />
                                        </View>
                                        <View style={styles.textContainer}>
                                            <Text style={[styles.districtName, isSelected && styles.districtNameSelected]}>
                                                {item.name}
                                            </Text>
                                            {item.id !== 'custom' && (
                                                <Text style={[styles.districtUrl, isSelected && styles.districtUrlSelected]} numberOfLines={1}>
                                                    {item.url}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                    {isSelected && <Check size={20} color={theme.colors.blue} />}
                                </TouchableOpacity>
                            );
                        }}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No districts found.</Text>
                                <TouchableOpacity style={styles.customFallbackBtn} onPress={() => handleSelect(KNOWN_DISTRICTS.find(d => d.id === 'custom'))}>
                                    <Text style={styles.customFallbackText}>Select "Other" to enter a custom URL</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

const getStyles = (theme) => StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: theme.colors.bg,
        borderTopLeftRadius: theme.radii.xl,
        borderTopRightRadius: theme.radii.xl,
        maxHeight: '90%',
        minHeight: '60%',
        paddingTop: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    title: {
        fontFamily: theme.fonts.d,
        fontSize: 22,
        fontWeight: '700',
        color: theme.colors.ink,
        letterSpacing: -0.5,
    },
    closeBtn: {
        padding: 5,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        marginHorizontal: 24,
        paddingHorizontal: 15,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: 15,
        height: 50,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontFamily: theme.fonts.m,
        fontSize: 14,
        color: theme.colors.ink,
        height: '100%',
    },
    clearBtn: {
        padding: 5,
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    districtItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    districtItemSelected: {
        borderColor: theme.colors.blue,
        backgroundColor: theme.colors.surface2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    iconBoxSelected: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.blue,
    },
    textContainer: {
        flex: 1,
    },
    districtName: {
        fontFamily: theme.fonts.s,
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.ink,
        marginBottom: 2,
    },
    districtNameSelected: {
        fontWeight: '700',
        color: theme.colors.ink,
    },
    districtUrl: {
        fontFamily: theme.fonts.m,
        fontSize: 11,
        color: theme.colors.ink3,
    },
    districtUrlSelected: {
        color: theme.colors.blue,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontFamily: theme.fonts.s,
        fontSize: 15,
        color: theme.colors.ink2,
        marginBottom: 15,
    },
    customFallbackBtn: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    customFallbackText: {
        fontFamily: theme.fonts.s,
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.ink,
    }
});
