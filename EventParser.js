// recurrence logic pulled from: 
// https://github.com/JoeHogan/sharepoint-events-parser/blob/master/dist/js/sp-events-parser.js

Object.prototype.clone = function(){
    var obj = (this instanceof Date) ? new Date(this) : (this instanceof Array) ? [] : {};
    if(obj instanceof Date)
        return obj;
    for(i in this){
        if(i === 'clone')
            continue;
        (this[i] && typeof this[i] === 'object') ? obj[i] = this[i].clone() : obj[i] = this[i];
    }
    return obj;
}
var SPCalendar = {
    getItems: function(url){
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.setRequestHeader("Accept", "application/json; odata=verbose");
        xhr.onload = this.processItems;
        xhr.send();
        return xhr;
    },
    processItems: function(request){
        var response = request.currentTarget.response || request.target.responseText;
		var data = JSON.parse(response);
        if(data.error){
            console.log(data.error.message.value);
        }
        else{
			this.items = data.d.results.clone();
            console.log(data.d.results);
			SPCalendarParser.parseEvents(data.d.results)
        }
    }
}
var SPCalendarParser = {
    parseEvents: function(events, start, end){
        var full = [];
		start = start || (function(){
			var start = new Date();
			start.setDate(1);
			return start;
		})();
		end = end || (function(){
			var end = new Date();
			end.setMonth(end.getMonth() + 1);
			end.setDate(0);
			return end;
		})();
		console.log(start + ' - ' + end);
        for(var i = 0; i < events.length; i++){
            var current = events[i];
            if(!current.fRecurrence){
                full = full[full.length] = this.parseEvent(current,start,end);
            }
            else{
                full = full.concat(this.parseRecurrence(current,start,end));
            }
        }
        return full;
    },
    parseDate: function(date, allDay){
        if(typeof date === 'string'){
            if(allDay){
                if(date.lastIndexOf('Z') === (date.length - 1))
                    return new Date(date.substring(0,date.length-1));
                else
                    return new Date(date);
            }
			else
				return new Date(date);
        }
        return date;
    },
    parseEvent: function(e){
        e.EventDate = new Date(this.parseDate(e.EventDate, e.fAllDayEvent));
        e.endDate = new Date(this.parseDate(e.endDate,e.fAllDayEvent));
        return e;
    },
    parseRecurrence: function(e,start,end){
        var parser,
            xmlDoc;
        if(window.DOMParser){
            parser = new DOMParser();
            xmlDoc = parser.parseFromString(e.RecurrenceData, 'text/xml');
        }
        else{
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = false;
            xmlDoc.loadXML(e.RecurrenceData);
        }
        start = start || this.parseDate(e.EventDate, e.fAllDayEvent);
        end = end || this.parseDate(e.EndDate, e.fAllDayEvent);
        var er = [],
            weekday = ['su', 'mo', 'tu','we', 'fr','sa'],
            weekofmonth = ['first','second','third','fourth'],
            rTotal = 0,
            total = 0,
            loop = true,
            init = this.parseDate(e.EventDate,e.fAllDayEvent),
            recurrenceData = xmlDoc.getElementsByTagName('daily')[0] || xmlDoc.getElementsByTagName('weekly')[0] || xmlDoc.getElementsByTagName('monthly')[0] || xmlDoc.getElementsByTagName('monthlyByDay')[0] || xmlDoc.getElementsByTagName('yearly')[0] || xmlDoc.getElementsByTagName('yearlyByDay')[0],
            recurrenceType = (recurrenceData) ? recurrenceData.nodeName : null;
        if(xmlDoc.getElementsByTagName('repeatInstances')[0]){
            rTotal = xmlDoc.getElementsByTagName('repeatInstances')[0].childNodes[0].nodeValue;
        }
        switch(recurrenceType){
            case 'daily':
                if(recurrenceData.hasAttribute('dayFrequency')){
                    var frequency = parseInt(recurrenceData.getAttribute('dayFrequency'));
                    while(loop){
                        total++;
                        if((new Date(init)).getTime() >= start.getTime()){
                            er.push(this.createItem(e,init));
                        }
                        init.setDate(init.getDate() + frequency);
                        if((new Date(init) > end) || (rTotal > 0 && rTotal <= total))
                            loop = false;
                    }
                }
                else if (recurrenceData.hasAttribute('weekday')){
                    // Make the change from daily on ever weekday to weekly on every weekday, may need to call itself again to parse as a weekly event;
                    e.RecurrenceData = e.RecurrenceData + "<weekly mo='TRUE' tu='TRUE' we='TRUE' th='TRUE' fr='TRUE' weekFrequency='1' />";
                }
                break;
            case 'weekly':
                var frequency = parseInt(recurrenceData.getAttribute('weekFrequency')),
					initDay = init.getDay();
                while(loop){
                    for(var i = init.getDay(); i < 7; i++){
                        if((rTotal > total || rTotal === 0) && recurrenceData.hasAttribute(weekday[i])){
                            total++;
                            if((new Date(init)).getTime() >= start.getTime()){
                                er.push(this.createItem(e,nd));
                            }
                        }
                    }
                    init.setDate(init.getDate() + ((7 * frequency) - initDay));
                    initDay = 0;
                    if((new Date(init) > end) || (rTotal > 0 && rTotal <= total))
                        loop = false;
                }
                break;
            case 'monthly':
                var frequency = parseInt(recurrenceData.getAttribute('monthFrequency')),
                    day = recurrenceData.getAttribute('day');
                    while(loop){
                        total++;
                        if((new Date(init)).getTime()  >= start.getTime()){
                            var nd = new Date(init);
                            nd.setDate(day);
                            if(nd.getMonth() === init.getMonth()){
                                er.push(this.createItem(e,nd));
                            }
                        }
                        init.setMonth(init.getMonth() + frequency);
                        if((new Date(init) > end) || (rTotal > 0 && rTotal <= total))
                            loop = false;
                    }
                break;
            case 'monthlyByDay':
                var frequency = parseInt(recurrenceData.getAttribute('monthFrequency')),
                    weekdayOfMonth = recurrenceData.getAttribute('weekdayOfMonth'),
                    temp = new Date();
                while(loop){
                    total++;
                    if((new Date(init)).getTime() >= start.getTime()){
                        var nd = new Date(init);
                        nd.setDate(1);
                        if(recurrenceData.hasAttribute('weekday')){
                            switch(nd.getDay()){
                                case 0:
                                    nd.setDate(nd.getDate() + 1);
                                    break;
                                case 6:
                                    nd.setDate(nd.getDate() + 2);
                                    break;
                                default:
                                    break;
                            }
                            if(weekdayOfMonth === 'last'){
                                while(nd.getMonth() === init.getMonth()){
                                    temp = new Date(nd);
                                    if(nd.get_day() === 5){
                                        nd.setDate(nd.getDate() + 3);
                                    }
                                    else{
                                        nd.setDate(nd.getDate() + 1);
                                    }
                                }
                                nd = new Date(temp);
                            }
                            else{
                                for(var i = 0; i < weekdayOfMonth.indexOf(weekdayOfMonth); i++){
                                    if(nd.getDay() === 5){
                                        nd.setDate(nd.getDate() + 3);
                                    }
                                    else{
                                        nd.setDate(nd.getDate() + 1);
                                    }
                                }
                            }
                        }
                        else if(recurrenceData.hasAttribute('weekend_day')){
                            if(nd.getDay() != 0 && nd.getDay() != 6){
                                nd.setDate(nd.getDate() + (6 - nd.getDay()));
                            }
                            if(weekdayOfMonth === 'last'){
                                while(nd.getMonth() === init.getMonth()){
                                    temp = new Date(nd);
                                    if(nd.getDay() === 0){
                                        nd.setDate(nd.getDate() + 6);
                                    }
                                    else{
                                        nd.setDate(nd.getDate() + 1);
                                    }
                                }
                                nd = new Date(temp);
                            }
                            else{
                                for(var i = 0; i < weekofmonth.indexOf(weekdayOfMonth); i++){
                                    if(nd.getDay() === 0){
                                        nd.setDate(nd.getDate() + 6);
                                    }
                                    else{
                                        nd.setDate(nd.getDate() + 1);
                                    }
                                }
                            }
                        }
                        else if(recurrenceData.hasAttribute('day')){
                            if(weekdayOfMonth === 'last'){
                                var nd = nd.setMonth(nd.getMonth() + 1);
                                nd.setDate(0);
                            }
                            else{
                                nd.setDate(nd.getDate() + (weekofmonth.indexOf(weekdayOfMonth)));
                            }
                        }
                        else{
                            for(var i = 0; i < weekday.length; i++){
                                if(recurrenceData.hasAttribute(weekday[i])){
                                    if(nd.getDate() > i){
                                        nd.setDate(nd.getDate() + (7 - (nd.getDay() - i)));
                                    }
                                    else{
                                        nd.setDate(nd.getDate() + (i - nd.getDay()));
                                    }
                                }
                            }
                            if(weekdayOfMonth === 'last'){
                                while(nd.getMonth() === internals.getMonth()){
                                    temp = new Date(nd);
                                    nd.setDate(nd.getDate() + 7);
                                }
                                nd = new Date(temp);
                            }
                            else{
                                for(var i = 0; i < weekofmonth.indexOf(weekdayOfMonth); i++){
                                    nd.setDate(nd.getDate() + 7);
                                }
                            }
                        }
                        if(nd.getMonth() === init.getMonth()){
                            er.push(this.createItem(e,nd));
                        }
                    }
                    init.setMonth(init.getMonth() + frequency);
                    if((new Date(init) > end) || (rTotal > 0 && rTotal <= total)){
                        loop = false;
                    }
                }
                break;
            case 'yearly':
                var frequency = parseInt(recurrencData.getAttribute('yearFrequency')),
                    month = recurrenceData.getAttribute('month')-1,
                    day = recurrenceData.getAttribute('day');
                    while(loop){
                        var nd = new Date(init);
                        nd.setMonth(month);
                        nd.setDate(day);
                        if((new Date(init)).getTime() <= nd.getTime()){
                            total++;
                            if((new Date(init)).getTime() <= start.getTime()){
                                er.push(this.createItem(e,nd));
                            }
                        }
                        init.setFullYear(init.getFullYear() + frequency);
                        if((new Date(init) > end) || (rTotal > 0 && rTotal <= total))
                            loop = false;
                    }
                break;
            case 'yearlyByDay':
                var frequency = parseInt(recurrenceData.getAttribute('yearFrequency')),
                    month = (parseInt(recurrenceData.getAttribute('month')) - 1),
                    weekdayofmonth = recurrenceData.getAttribute('weekdayOfMonth'),
                    day = 0;
                    for(var i = 0; i < weekday.length; i++){
                        if(recurrenceData.hasAttribute(weekday[i])){
                            if(recurrenceData.getAttribute(weekday[i]).toLowerCase() === 'true'){
                                day = i;
                            }
                        }
                    }
                    while(loop){
                        var nd = new Date(init);
                        nd.setMonth(month);
                        if((new Date(init)).getTime() <= nd.getTime()){
                            total++;
                            if((new Date(init)).getTime() >= start.getTime()){
                                nd.setDate(1);
                                var dayOfMonth = nd.getDay();
                                if(day < dayOfMonth){
                                    nd.setDate(nd.getDate() + ((7 - dayOfMonth) + day));
                                }
                                else{
                                    nd.setDate(nd.getDate() + (day - dayOfMonth));
                                }
                                if(weekdayOfMonth === 'last'){
                                    var temp = new Date(nd);
                                    while(temp.getMonth() === month){
                                        nd = new Date(temp);
                                        temp.setDate(temp.getDate() + 7);
                                    }
                                }
                                else{
                                    nd.setDate(nd.getDate() + (7 * (weekofmonth.indexOf(weekdayOfMonth))));
                                }
                                if(nd.getMonth() === month){
                                    er.push(this.createItem(e,nd));
                                }
                            }
                        }
                        init.setFullyear(init.getFullYear() + frequency);
                        init.setMonth(month);
                        init.setDate(1);
                        if((new Date(init) > end) || (rTotal > 0 && rTotal <= total))
                            loop = false;
                    }   
                break;
            default: 
                break;
        }
		console.log(er);
        return er;
    },
    createItem: function(e,date){
        var ed = new Date(date);
        ed.setSeconds(ed.getSeconds() + e.Duration);
        var event = e.clone();
        event.EventDate = new Date(date);
        event.EndDate = ed;
        event.fRecurrence = false;
        event.Id = event.ID = e.Id;
        return event;
    }
}

//SPCalendar.getItems("/sites/mkg/_api/web/lists/getByTitle('FCTest')/Items?$select=*,Duration,RecurrenceData");
