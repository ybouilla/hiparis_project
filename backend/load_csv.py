import csv
from typing import List

import pandas as pd

def load_data():
    # change path here
    df = pd.read_csv("movies.csv",
                     engine="python",
                     header=0,
                     sep=",",
                     encoding="utf-8",
                    
    )
    # convert values to correct datatype
    df["Popularity"] = pd.to_numeric(df["Popularity"], errors="coerce")
    df["Vote_Count"] = pd.to_numeric(df["Vote_Count"], errors="coerce").astype("Int64")
    df["Vote_Average"] = pd.to_numeric(df["Vote_Average"], errors="coerce")

    # store Genres in a list (eg "Action, Crime, Thriller" -> ["Action", "Crime", "Thriller"])
    df["Genre_List"] = df["Genre"].apply(lambda x: [g.strip() for g in str(x).split(",")])

    # convert here days into python's datetime
    df["Release_Date"] = pd.to_datetime(
        df["Release_Date"],
        dayfirst=True,
        errors="coerce"
    ) 


    return df

def flush_buffer(buf):
    if not buf.strip():
        return None
    # parse CSV safely from reconstructed line
    return next(csv.reader([buf], skipinitialspace=True))

def _clean_row(row: List[str], cleaned: List[str],):
    
    if len(row) == 1:
         
        cleaned[-1] += row[0]
    if len(row) >1:
        # continuation line → append with separator
        cleaned.extend(row[1:])



def test_buffer():
    data = [['2013-10-20', 'Pixie Hollow Bake Off', "Tink challenges Gelata to see who can bake the best cake for the queen's party.  Plus 10 Disney Fairies Mini-Shorts:"],
            ['- Just Desserts'],
 ['- If The Hue Fits'],
['- Dust Up'],
['- Scents And, Sensibility'],
 ['- Just One O,f The Girls'],
 ['- Volleybug'],
 ['- Hide And Tink'],
 ["- Rainbow's Ends"],
['- Fawn And Games'],
 ['- Magic Tricks', '61.328', '35', '7.1', 'en', 'Animation', 'https://image.tmdb.org/t/p/original/6iXYe7AkQ1QIfMFuvXsSCT2zF7s.jpg']
    ]
    cleaned = []
    buffer = ""
    val = len(data[0])
    cleaned = data[0]
    for item in data[1:]:
        
        _clean_row(item, cleaned)

    print(cleaned, 'length', len(cleaned))
def load_csv():


    data = []
    cleaned = []
    is_buffering = False
    file_path = "movies.csv"
    len_row: int = 0
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        # Read raw lines first (gives more control over broken rows)
        lines = f.readlines()

        reader = csv.reader(
            #(clean_line(line) for line in lines),
            lines,
            delimiter=",",
            quotechar='"',
            skipinitialspace=True
        )

        for i, row in enumerate(reader):
            if i == 0:
                len_row = len(row)
            

            try:
                # Skip empty rows
                if not row or len(row) < 1:
                    print("skipped :", row)
                    continue
                if len(row) < len_row:  # a regular row in the csv file s lenght is 9 items: if less than 9, it might be due to an issue with the parsing
                    print("faulty row", row)
                    if not is_buffering:
                        is_buffering = True
                        cleaned = row

                    else:
                        _clean_row(row, cleaned)
                else:
                    data.append(row)
                    cleaned = []
                    is_buffering = False
            except Exception as e:
                print(f"Skipping bad row {i}: {e}")

    headers = data[0] # extract headers
    data = pd.DataFrame(data[1:])
    data.columns = headers
    return data

#test_buffer()
# df = load_csv()
# print("len", len(df))
# headers = df[0] # extract headers
# df = pd.DataFrame(df[1:])
# df.columns = headers
# import pdb;pdb.set_trace()
# print(df.iloc[1110])
