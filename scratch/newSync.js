    const switchPeriod = async (periodIndex) => {
        try {
            const isDemo = await AsyncStorage.getItem('isDemoData') === 'true';
            const raw = await AsyncStorage.getItem(`studentVueGradesQ${periodIndex}`);
            const perRaw = await AsyncStorage.getItem('studentVuePeriods');
            const ps = JSON.parse(perRaw || '[]');
            const pName = ps.find(p => p.index === periodIndex)?.name || `Quarter ${periodIndex + 1}`;
            
            if (raw) {
                const g = JSON.parse(raw);
                setSvClasses(g);
                await AsyncStorage.setItem('studentVueGrades', raw);
            } else if (periodIndex === 0) {
                // Fallback to generic grades if Q0 is missing
                const currentGrades = await AsyncStorage.getItem('studentVueGrades');
                if (currentGrades) setSvClasses(JSON.parse(currentGrades));
            } else {
                setSvClasses([]); // No data for this quarter yet
            }
            
            setCurPeriodName(pName);
            setCurPeriodIdx(periodIndex);
            await AsyncStorage.setItem('studentVuePeriodName', pName);
            await AsyncStorage.setItem('studentVuePeriodIndex', String(periodIndex));
            setSelectedClass(null);
        } catch (e) {
            console.error(e);
        }
    };

    const syncAllPeriods = async () => {
        try {
            const isDemo = await AsyncStorage.getItem('isDemoData') === 'true';
            const [svUser, svPass, svUrl] = await Promise.all([
                AsyncStorage.getItem('svUsername'),
                AsyncStorage.getItem('svPassword'),
                AsyncStorage.getItem('svDistrictUrl'),
            ]);

            if (isDemo && (!svUser || !svPass)) {
                setIsSyncing(true);
                await new Promise(r => setTimeout(r, 1000));
                await switchPeriod(curPeriodIdx ?? 0);
                setIsSyncing(false);
                return;
            }

            if (!svUser || !svPass || !svUrl) {
                Alert.alert('Not configured', 'Enter credentials in Settings first.');
                return;
            }
            
            setIsSyncing(true);
            const finalUrl = svUrl.endsWith('Service/PXPCommunication.asmx') ? svUrl : `${svUrl}/Service/PXPCommunication.asmx`;
            const base = Platform.OS === 'web' ? '' : 'https://optionapp.online';

            let currentPeriods = periods;
            if (currentPeriods.length === 0) {
                const soap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser}</userID><password>${svPass}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr></paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
                const res = await fetch(`${base}/api/studentvue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalUrl, soapPayload: soap }) });
                if (!res.ok) throw new Error('Failed to fetch periods');
                const xml = await res.text();
                const { periods: fetchedPeriods } = parseStudentVueGradebook(xml);
                if (fetchedPeriods?.length > 0) {
                    currentPeriods = fetchedPeriods;
                    setPeriods(currentPeriods);
                    await AsyncStorage.setItem('studentVuePeriods', JSON.stringify(currentPeriods));
                }
            }

            if (currentPeriods.length === 0) {
                Alert.alert('Error', 'Could not find any grading periods.');
                setIsSyncing(false);
                return;
            }

            for (const p of currentPeriods) {
                await saveGradeSnapshot(p.index);
            }

            let allChanges = [];
            const fetchPromises = currentPeriods.map(async (p) => {
                const soap = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ProcessWebServiceRequest xmlns="http://edupoint.com/webservices/"><userID>${svUser}</userID><password>${svPass}</password><skipLoginLog>1</skipLoginLog><parent>0</parent><webServiceHandleName>PXPWebServices</webServiceHandleName><methodName>Gradebook</methodName><paramStr>&lt;Parms&gt;&lt;ReportPeriod&gt;${p.index}&lt;/ReportPeriod&gt;&lt;/Parms&gt;</paramStr></ProcessWebServiceRequest></soap:Body></soap:Envelope>`;
                const res = await fetch(`${base}/api/studentvue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUrl: finalUrl, soapPayload: soap }) });
                if (!res.ok) return null;
                const xml = await res.text();
                if (!xml.includes('Gradebook') && xml.includes('RT_ERROR')) return null;
                return { index: p.index, xml };
            });

            const results = await Promise.all(fetchPromises);
            
            let updatedCurrent = false;
            const activePeriodIndex = curPeriodIdx ?? currentPeriods[currentPeriods.length - 1]?.index;

            for (const res of results) {
                if (!res) continue;
                const { classes: parsed } = parseStudentVueGradebook(res.xml);
                if (parsed?.length > 0) {
                    const parsedStr = JSON.stringify(parsed);
                    await AsyncStorage.setItem(`studentVueGradesQ${res.index}`, parsedStr);
                    
                    if (res.index === activePeriodIndex) {
                        setSvClasses(parsed);
                        await AsyncStorage.setItem('studentVueGrades', parsedStr);
                        updatedCurrent = true;
                    }
                    
                    const changes = await checkForGradeChanges(res.index, parsedStr);
                    if (changes && changes.length > 0) {
                        allChanges = [...allChanges, ...changes];
                    }
                }
            }

            if (!updatedCurrent && results.length > 0) {
                // If active period wasn't fetched but others were, just load the active one from storage.
                await switchPeriod(activePeriodIndex);
            }
            
            await AsyncStorage.setItem('isDemoData', 'false');

            if (allChanges.length > 0) {
                setGradeChanges(allChanges);
                const msg = allChanges.length === 1
                    ? formatChangeMessage(allChanges[0])
                    : `${allChanges.length} grade updates detected`;
                if (Platform.OS === 'web') window.alert(`Grade Update: ${msg}`);
                else Alert.alert('Grade Update', msg);
                
                if (Platform.OS !== 'web') {
                    for (const change of allChanges) {
                        if (change.type === 'grade_changed' && typeof change.oldGrade === 'number' && typeof change.newGrade === 'number') {
                            scheduleGradeChangeNotification(change.className, change.oldGrade, change.newGrade).catch(() => {});
                        }
                    }
                }
            }

        } catch (e) { 
            Alert.alert('Sync Error', e.message); 
        } finally {
            setIsSyncing(false);
        }
    };
